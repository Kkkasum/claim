import { compile } from '@ton/blueprint';
import { Address, Cell, toNano } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';

import { Claim, Error as ClaimError, Opcodes as ClaimOpcodes } from '../wrappers/Claim';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet, Opcodes as JettonWalletOpcodes } from '../wrappers/JettonWallet';
import { User, Opcodes as UserOpcodes } from '../wrappers/User';

describe('Claim', () => {
    let claimCode: Cell;
    let userCode: Cell;
    let jettonMinterCode: Cell;
    let jettonWalletCode: Cell;

    let blockchain: Blockchain;
    let admin: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let jettonWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>;
    let claim: SandboxContract<Claim>;
    let claimJettonWallet: SandboxContract<JettonWallet>;
    let user: SandboxContract<User>;
    let claimAmount: bigint;
    let claimFee: bigint;

    beforeAll(async () => {
        claimCode = await compile('Claim');
        userCode = await compile('User');
        jettonMinterCode = await compile('JettonMinter');
        jettonWalletCode = await compile('JettonWallet');

        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin');

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

        user = blockchain.openContract(
            User.createFromConfig(
                {
                    adminAddress: claim.address,
                    userAddress: (await blockchain.treasury('user')).address,
                },
                userCode,
            ),
        );
        const deployUserResult = await user.sendDeploy(admin.getSender(), toNano('0.05'));
        expect(deployUserResult.transactions).toHaveTransaction({
            from: admin.address,
            to: user.address,
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

        claimAmount = await user.getClaimAmount();
        claimFee = await user.getClaimFee();
    });

    it('user contract should be able to claim', async () => {
        const userAddress = await user.getUserAddress();
        const userJettonWallet = await jettonWallet(userAddress);

        const claimJettonBalanceBefore = await claimJettonWallet.getBalance();
        const userJettonBalanceBefore = await userJettonWallet.getBalance();

        const claimResult = await claim.sendClaim(blockchain.sender(user.address), {
            value: claimFee,
            claimAmount: claimAmount,
            recepient: userAddress,
        });
        expect(claimResult.transactions).toHaveTransaction({
            from: user.address,
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

    it('not user contract should not be able to claim', async () => {
        const sender = await blockchain.treasury('sender');
        const senderJettonWallet = await jettonWallet(sender.address);

        const claimJettonBalanceBefore = await claimJettonWallet.getBalance();
        const senderJettonBalanceBefore = await senderJettonWallet.getBalance();

        const claimResult = await claim.sendClaim(sender.getSender(), {
            value: claimFee,
            claimAmount: claimAmount,
            recepient: sender.address,
        });
        expect(claimResult.transactions).toHaveTransaction({
            from: sender.address,
            to: claim.address,
            op: UserOpcodes.claim,
            exitCode: ClaimError.accessDenied,
            aborted: true,
        });

        expect(await claimJettonWallet.getBalance()).toEqual(claimJettonBalanceBefore);
        expect(await senderJettonWallet.getBalance()).toEqual(senderJettonBalanceBefore);
    });

    it('admin should be able to first claim', async () => {
        const recepient = await blockchain.treasury('recepient');
        const recepientJettonWallet = await jettonWallet(recepient.address);
        const recepientJettonBalanceBefore = await recepientJettonWallet.getBalance();

        const firstClaimResult = await claim.sendFirstClaim(admin.getSender(), {
            value: toNano('0.05'),
            claimAmount: claimAmount,
            recepient: recepient.address,
        });
        expect(firstClaimResult.transactions).toHaveTransaction({
            from: admin.address,
            to: claim.address,
            op: ClaimOpcodes.firstClaim,
            success: true,
        });
        expect(firstClaimResult.transactions).toHaveTransaction({
            from: claim.address,
            to: claimJettonWallet.address,
            op: JettonWalletOpcodes.transfer,
            success: true,
        });
        expect(firstClaimResult.transactions).toHaveTransaction({
            from: claimJettonWallet.address,
            to: recepientJettonWallet.address,
            op: JettonWalletOpcodes.internalTransfer,
            success: true,
        });

        expect(await recepientJettonWallet.getBalance()).toEqual(recepientJettonBalanceBefore + claimAmount);
    });

    it('not admin should not be able to first claim', async () => {
        const sender = await blockchain.treasury('sender');
        const senderJettonWallet = await jettonWallet(sender.address);

        const senderJettonBalanceBefore = await senderJettonWallet.getBalance();

        const firstClaimResult = await claim.sendFirstClaim(sender.getSender(), {
            value: toNano('0.05'),
            claimAmount: claimAmount,
            recepient: sender.address,
        });
        expect(firstClaimResult.transactions).toHaveTransaction({
            from: sender.address,
            to: claim.address,
            exitCode: ClaimError.accessDenied,
            aborted: true,
        });

        expect(await senderJettonWallet.getBalance()).toEqual(senderJettonBalanceBefore);
    });

    it('admin should be able to boost', async () => {
        const userAddress = await user.getUserAddress();
        const boost = toNano('1');

        const boostResult = await claim.sendBoost(admin.getSender(), {
            value: toNano('0.05'),
            userAddress: userAddress,
            boost: boost,
        });
        expect(boostResult.transactions).toHaveTransaction({
            from: admin.address,
            to: claim.address,
            op: ClaimOpcodes.boost,
            success: true,
        });
        expect(boostResult.transactions).toHaveTransaction({
            from: claim.address,
            to: user.address,
            op: ClaimOpcodes.boost,
            success: true,
        });

        const claimAmountAfter = await user.getClaimAmount();
        expect(claimAmountAfter).toEqual(claimAmount + boost);

        // check claim with update claim_amount in user contract storage
        const userJettonWallet = await jettonWallet(userAddress);
        const claimJettonBalanceBefore = await claimJettonWallet.getBalance();
        const userJettonBalanceBefore = await userJettonWallet.getBalance();

        const claimResult = await claim.sendClaim(blockchain.sender(user.address), {
            value: claimFee,
            claimAmount: claimAmountAfter,
            recepient: userAddress,
        });
        expect(claimResult.transactions).toHaveTransaction({
            from: user.address,
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

        expect((await claimJettonWallet.getBalance()).toString()).toEqual(
            (claimJettonBalanceBefore - claimAmountAfter).toString(),
        );
        expect((await userJettonWallet.getBalance()).toString()).toEqual(
            (userJettonBalanceBefore + claimAmountAfter).toString(),
        );
    });

    it('not admin should not be able to boost', async () => {
        const userAddress = await user.getUserAddress();
        const sender = await blockchain.treasury('sender');
        const boost = toNano('1');

        const boostResult = await claim.sendBoost(sender.getSender(), {
            value: toNano('0.05'),
            userAddress: userAddress,
            boost: boost,
        });
        expect(boostResult.transactions).toHaveTransaction({
            from: sender.address,
            to: claim.address,
            exitCode: ClaimError.accessDenied,
            aborted: true,
        });
    });

    it('admin should be able to withdraw ton', async () => {
        const withdrawTonAmount = toNano('0.5');

        const withdrawTonResult = await claim.sendWithdrawTon(admin.getSender(), {
            value: toNano('0.05'),
            amount: withdrawTonAmount,
        });
        expect(withdrawTonResult.transactions).toHaveTransaction({
            from: admin.address,
            to: claim.address,
            op: ClaimOpcodes.withdrawTon,
            success: true,
        });
        expect(withdrawTonResult.transactions).toHaveTransaction({
            from: claim.address,
            to: admin.address,
            value: withdrawTonAmount,
            success: true,
        });
    });

    it('not admin should not be able to withdraw ton', async () => {
        const sender = await blockchain.treasury('sender');
        const withdrawTonAmount = toNano('0.5');

        const withdrawTonResult = await claim.sendWithdrawTon(sender.getSender(), {
            value: toNano('0.05'),
            amount: withdrawTonAmount,
        });
        expect(withdrawTonResult.transactions).toHaveTransaction({
            from: sender.address,
            to: claim.address,
            exitCode: ClaimError.accessDenied,
            aborted: true,
        });
    });

    it('admin should be able to withdraw jetton', async () => {
        const adminJettonWallet = await jettonWallet(admin.address);
        const adminJettonBalanceBefore = await adminJettonWallet.getBalance();
        const withdrawJettonAmount = toNano('1');

        const withdrawJettonResult = await claim.sendWithdrawJetton(admin.getSender(), {
            value: toNano('0.05'),
            amount: withdrawJettonAmount,
        });
        expect(withdrawJettonResult.transactions).toHaveTransaction({
            from: admin.address,
            to: claim.address,
            op: ClaimOpcodes.withdrawJetton,
            success: true,
        });
        expect(withdrawJettonResult.transactions).toHaveTransaction({
            from: claim.address,
            to: claimJettonWallet.address,
            op: JettonWalletOpcodes.transfer,
            success: true,
        });
        expect(withdrawJettonResult.transactions).toHaveTransaction({
            from: claimJettonWallet.address,
            to: adminJettonWallet.address,
            op: JettonWalletOpcodes.internalTransfer,
            success: true,
        });

        expect(await adminJettonWallet.getBalance()).toEqual(adminJettonBalanceBefore + withdrawJettonAmount);
    });

    it('not admin should not be able to withdraw jetton', async () => {
        const sender = await blockchain.treasury('sender');
        const withdrawJettonAmount = toNano('1');

        const withdrawTonResult = await claim.sendWithdrawJetton(sender.getSender(), {
            value: toNano('0.05'),
            amount: withdrawJettonAmount,
        });
        expect(withdrawTonResult.transactions).toHaveTransaction({
            from: sender.address,
            to: claim.address,
            exitCode: ClaimError.accessDenied,
            aborted: true,
        });
    });

    it('admin should be able to withdraw all tokens', async () => {
        const adminJettonWallet = await jettonWallet(admin.address);
        const adminJettonBalanceBefore = await adminJettonWallet.getBalance();
        const adminBalanceBefore = await admin.getBalance();
        const withdrawJettonAmount = await claimJettonWallet.getBalance();

        const withdrawEmergencyResult = await claim.sendWithdrawEmergency(admin.getSender(), {
            value: toNano('0.05'),
            jettonAmount: withdrawJettonAmount,
        });
        expect(withdrawEmergencyResult.transactions).toHaveTransaction({
            from: admin.address,
            to: claim.address,
            op: ClaimOpcodes.withdrawEmergency,
            destroyed: true,
            success: true,
        });
        expect(withdrawEmergencyResult.transactions).toHaveTransaction({
            from: claim.address,
            to: claimJettonWallet.address,
            op: JettonWalletOpcodes.transfer,
            success: true,
        });
        expect(withdrawEmergencyResult.transactions).toHaveTransaction({
            from: claimJettonWallet.address,
            to: adminJettonWallet.address,
            op: JettonWalletOpcodes.internalTransfer,
            success: true,
        });
        expect(withdrawEmergencyResult.transactions).toHaveTransaction({
            from: claim.address,
            to: admin.address,
            success: true,
        });

        expect(await adminJettonWallet.getBalance()).toEqual(adminJettonBalanceBefore + withdrawJettonAmount);
        expect(await claim.getBalance()).toEqual(0n);
        expect(await admin.getBalance()).toBeGreaterThan(adminBalanceBefore);
    });

    it('not admin should not be able to withdraw all tokens', async () => {
        const sender = await blockchain.treasury('sender');
        const withdrawJettonAmount = await claimJettonWallet.getBalance();

        const withdrawTonResult = await claim.sendWithdrawEmergency(sender.getSender(), {
            value: toNano('0.05'),
            jettonAmount: withdrawJettonAmount,
        });
        expect(withdrawTonResult.transactions).toHaveTransaction({
            from: sender.address,
            to: claim.address,
            exitCode: ClaimError.accessDenied,
            aborted: true,
        });
    });
});
