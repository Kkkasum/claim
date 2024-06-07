import { compile } from '@ton/blueprint';
import { Address, Cell, toNano } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';

import { Claim } from '../wrappers/Claim';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet, Opcodes as JettonWalletOpcodes } from '../wrappers/JettonWallet';
import { User, Error as UserError, Opcodes as UserOpcodes } from '../wrappers/User';

describe('User', () => {
    let claimCode: Cell;
    let userCode: Cell;
    let jettonMinterCode: Cell;
    let jettonWalletCode: Cell;

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let sender: SandboxContract<TreasuryContract>;
    let firstUser: SandboxContract<TreasuryContract>;
    let secondUser: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let jettonWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>;
    let claim: SandboxContract<Claim>;
    let claimJettonWallet: SandboxContract<JettonWallet>;
    let firstUserContract: SandboxContract<User>;
    let secondUserContract: SandboxContract<User>;
    let claimAmount: bigint;
    let claimFee: bigint;

    beforeAll(async () => {
        claimCode = await compile('Claim');
        userCode = await compile('User');
        jettonMinterCode = await compile('JettonMinter');
        jettonWalletCode = await compile('JettonWallet');

        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin');
        sender = await blockchain.treasury('sender');
        firstUser = await blockchain.treasury('firstUser');
        secondUser = await blockchain.treasury('secondUser');

        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    adminAddress: admin.address,
                    content: Cell.EMPTY,
                    jettonWalletCode: jettonWalletCode,
                },
                jettonMinterCode,
            ),
        );
        const deployJettonMinterResult = await jettonMinter.sendDeploy(admin.getSender(), toNano('1'));
        expect(deployJettonMinterResult.transactions).toHaveTransaction({
            from: admin.address,
            to: jettonMinter.address,
            deploy: true,
        });

        jettonWallet = async (address: Address) =>
            blockchain.openContract(JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(address)));

        claim = blockchain.openContract(
            Claim.createFromConfig(
                {
                    adminAddress: admin.address,
                    jettonMasterAddress: jettonMinter.address,
                    jettonWalletCode: jettonWalletCode,
                    userContractCode: userCode,
                },
                claimCode,
            ),
        );
        const deployClaimResult = await claim.sendDeploy(admin.getSender(), toNano('0.05'));
        expect(deployClaimResult.transactions).toHaveTransaction({
            from: admin.address,
            to: claim.address,
            deploy: true,
        });

        firstUserContract = blockchain.openContract(
            User.createFromConfig(
                {
                    adminAddress: claim.address,
                    userAddress: firstUser.address,
                },
                userCode,
            ),
        );
        const deployFirstUserContractResult = await firstUserContract.sendDeploy(admin.getSender(), toNano('0.05'));
        expect(deployFirstUserContractResult.transactions).toHaveTransaction({
            from: admin.address,
            to: firstUserContract.address,
            deploy: true,
        });

        secondUserContract = blockchain.openContract(
            User.createFromConfig(
                {
                    adminAddress: claim.address,
                    userAddress: secondUser.address,
                },
                userCode,
            ),
        );
        const deploySecondUserContractResult = await secondUserContract.sendDeploy(admin.getSender(), toNano('0.05'));
        expect(deploySecondUserContractResult.transactions).toHaveTransaction({
            from: admin.address,
            to: secondUserContract.address,
            deploy: true,
        });

        claimJettonWallet = await jettonWallet(claim.address);
        const initialJettonSupply = await jettonMinter.getTotalSupply();
        const mintJettonAmount = toNano('5');

        const mintResult = await jettonMinter.sendMint(admin.getSender(), {
            value: toNano('0.05'),
            toAddress: claim.address,
            jettonAmount: mintJettonAmount,
            forwardTonAmount: toNano('0.5'),
            totalTonAmount: toNano('1'),
        });
        expect(mintResult.transactions).toHaveTransaction({
            from: admin.address,
            to: jettonMinter.address,
            success: true,
        });
        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: claimJettonWallet.address,
            deploy: true,
        });
        expect(await jettonMinter.getTotalSupply()).toEqual(initialJettonSupply + mintJettonAmount);
        expect(await claimJettonWallet.getBalance()).toEqual(mintJettonAmount);

        // init state: firstUserContract == secondUserContract
        claimAmount = await firstUserContract.getClaimAmount();
        claimFee = await firstUserContract.getClaimFee();
    });

    it('user assigned to user contract should be able to claim', async () => {
        const userJettonWallet = await jettonWallet(firstUser.address);

        const claimJettonBalanceBefore = await claimJettonWallet.getBalance();
        const userJettonBalanceBefore = await userJettonWallet.getBalance();

        const claimResult = await firstUserContract.sendClaim(firstUser.getSender(), claimFee);
        expect(claimResult.transactions).toHaveTransaction({
            from: firstUser.address,
            to: firstUserContract.address,
            op: UserOpcodes.claim,
            success: true,
        });
        expect(claimResult.transactions).toHaveTransaction({
            from: firstUserContract.address,
            to: claim.address,
            op: UserOpcodes.claim,
            success: true,
        });
        expect(claimResult.transactions).toHaveTransaction({
            from: claim.address,
            to: claimJettonWallet.address,
            op: JettonWalletOpcodes.transfer,
            success: true,
        });
        expect(claimResult.transactions).toHaveTransaction({
            from: claimJettonWallet.address,
            to: userJettonWallet.address,
            op: JettonWalletOpcodes.internalTransfer,
            success: true,
        });

        expect(await claimJettonWallet.getBalance()).toEqual(claimJettonBalanceBefore - claimAmount);
        expect(await userJettonWallet.getBalance()).toEqual(userJettonBalanceBefore + claimAmount);
    });

    it('user not assigned to user contract should not be able to claim', async () => {
        const claimResult = await firstUserContract.sendClaim(sender.getSender(), claimFee);
        expect(claimResult.transactions).toHaveTransaction({
            from: sender.address,
            to: firstUserContract.address,
            exitCode: UserError.accessDenied,
            aborted: true,
        });
    });

    it('user should not be able to claim by sending value less than claim fee', async () => {
        const claimResult = await secondUserContract.sendClaim(secondUser.getSender(), toNano('0.05'));
        expect(claimResult.transactions).toHaveTransaction({
            from: secondUser.address,
            to: secondUserContract.address,
            exitCode: UserError.notEnoughTon,
            aborted: true,
        });
    });

    it('user should be able to claim only once in 24 hrs', async () => {
        const userJettonWallet = await jettonWallet(secondUser.address);

        const claimJettonBalanceBefore = await claimJettonWallet.getBalance();
        const userJettonBalanceBefore = await userJettonWallet.getBalance();

        const claimResult = await secondUserContract.sendClaim(secondUser.getSender(), claimFee);
        expect(claimResult.transactions).toHaveTransaction({
            from: secondUser.address,
            to: secondUserContract.address,
            op: UserOpcodes.claim,
            success: true,
        });
        expect(claimResult.transactions).toHaveTransaction({
            from: secondUserContract.address,
            to: claim.address,
            op: UserOpcodes.claim,
            success: true,
        });
        expect(claimResult.transactions).toHaveTransaction({
            from: claim.address,
            to: claimJettonWallet.address,
            op: JettonWalletOpcodes.transfer,
            success: true,
        });
        expect(claimResult.transactions).toHaveTransaction({
            from: claimJettonWallet.address,
            to: userJettonWallet.address,
            op: JettonWalletOpcodes.internalTransfer,
            success: true,
        });

        expect(await claimJettonWallet.getBalance()).toEqual(claimJettonBalanceBefore - claimAmount);
        expect(await userJettonWallet.getBalance()).toEqual(userJettonBalanceBefore + claimAmount);

        const secondClaimResult = await secondUserContract.sendClaim(secondUser.getSender(), claimFee);
        expect(secondClaimResult.transactions).toHaveTransaction({
            from: secondUser.address,
            to: secondUserContract.address,
            exitCode: UserError.notYet,
            aborted: true,
        });
    });

    it('not admin should not be able to withdraw ton', async () => {
        const withdrawTonResult = await firstUserContract.sendWithdrawEmergency(sender.getSender(), toNano('0.05'));
        expect(withdrawTonResult.transactions).toHaveTransaction({
            from: sender.address,
            to: firstUserContract.address,
            exitCode: UserError.accessDenied,
            aborted: true,
        });
    });

    it('admin should be able to withdraw all ton', async () => {
        const withdrawTonResult = await firstUserContract.sendWithdrawEmergency(
            blockchain.sender(claim.address),
            toNano('0.05'),
        );
        expect(withdrawTonResult.transactions).toHaveTransaction({
            from: claim.address,
            to: firstUserContract.address,
            op: UserOpcodes.withdrawEmergency,
            success: true,
        });
        expect(withdrawTonResult.transactions).toHaveTransaction({
            from: firstUserContract.address,
            to: claim.address,
            success: true,
        });

        expect(await firstUserContract.getBalance()).toEqual(0n);
    });
});
