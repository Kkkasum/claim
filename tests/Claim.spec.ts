import { compile } from '@ton/blueprint';
import { Cell, toNano } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';

import { JETTON_BYTE_CODE, JETTON_MASTER_ADDRESS } from '../helpers/constants';
import { Claim, Opcodes as ClaimOpcodes } from '../wrappers/Claim';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { User, Opcodes as UserOpcodes } from '../wrappers/User';

describe('Claim', () => {
    let code: Cell;
    let userContractCode: Cell;
    let jettonWalletCode: Cell;

    beforeAll(async () => {
        code = await compile('Claim');
        userContractCode = await compile('User');
        jettonWalletCode = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let claim: SandboxContract<Claim>;
    let jettonMinter: SandboxContract<JettonMinter>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        claim = blockchain.openContract(
            Claim.createFromConfig(
                {
                    adminAddress: deployer.address,
                    jettonMasterAddress: JETTON_MASTER_ADDRESS,
                    jettonWalletCode: JETTON_BYTE_CODE,
                    userContractCode: userContractCode,
                },
                code,
            ),
        );

        const deployResult = await claim.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: claim.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and claim are ready to use
    });

    it('should accept deposit', async () => {
        const sender = await blockchain.treasury('sender');
        const depositResult = await claim.sendDeposit(sender.getSender(), toNano('1'));

        expect(depositResult.transactions).toHaveTransaction({
            from: sender.address,
            to: claim.address,
            op: ClaimOpcodes.deposit,
            success: true,
        });

        const balance = await claim.getBalance();
        expect(balance).toBeGreaterThan(toNano('1'));
    });

    it('should claim only from user contract', async () => {
        const user = await blockchain.treasury('user');
        const userContract = blockchain.openContract(
            User.createFromConfig(
                {
                    adminAddress: claim.address,
                    userAddress: user.address,
                },
                userContractCode,
            ),
        );

        expect(userContract.address).toEqualAddress(await claim.getUserContractAddress(user.address));

        const userContractDeployResult = await userContract.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(userContractDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: userContract.address,
            deploy: true,
            success: true,
        });

        const claimJettonWallet = blockchain.openContract(
            JettonWallet.createFromConfig(
                {
                    ownerAddress: claim.address,
                    minterAddress: JETTON_MASTER_ADDRESS,
                    walletCode: JETTON_BYTE_CODE,
                },
                jettonWalletCode,
            ),
        );
        const userJettonWallet = blockchain.openContract(
            JettonWallet.createFromConfig(
                {
                    ownerAddress: user.address,
                    minterAddress: JETTON_MASTER_ADDRESS,
                    walletCode: JETTON_BYTE_CODE,
                },
                jettonWalletCode,
            ),
        );

        const claimJettonBalanceBefore = await claimJettonWallet.getBalance();
        const userJettonBalanceBefore = await userJettonWallet.getBalance();

        // UW -> UC -> CC -> UW
        const userClaimResult = await userContract.sendClaim(user.getSender(), toNano('0.16'));
        expect(userClaimResult.transactions).toHaveTransaction({
            from: user.address,
            to: userContract.address,
            op: UserOpcodes.claim,
            success: true,
        });
        expect(userClaimResult.transactions).toHaveTransaction({
            from: userContract.address,
            to: claim.address,
            op: UserOpcodes.claim,
            success: true,
        });

        const claimJettonBalanceAfter = await claimJettonWallet.getBalance();
        const userJettonBalanceAfter = await userJettonWallet.getBalance();

        const claimAmount = await userContract.getClaimAmount();

        console.log(userJettonBalanceAfter, userJettonBalanceBefore);

        expect(userJettonBalanceAfter).toBeLessThan(userJettonBalanceBefore);
        expect(claimJettonBalanceAfter).toBeGreaterThan(claimJettonBalanceBefore);
        expect(userJettonBalanceAfter - claimAmount).toEqual(userJettonBalanceBefore);
        expect(claimJettonBalanceAfter + claimAmount).toEqual(claimJettonBalanceBefore);
    });

    it('should withdraw ton for admin', async () => {
        const sender = await blockchain.treasury('sender');
        const depositResult = await claim.sendDeposit(sender.getSender(), toNano('1'));

        const senderWithdrawResult = await claim.sendWithdrawEmergency(sender.getSender(), toNano('0.05'));

        const adminWithdrawResult = await claim.sendWithdrawEmergency(deployer.getSender(), toNano('0.05'));
    });

    it('should withdraw all funds for admin', async () => {
        const sender = await blockchain.treasury('sender');
        await claim.sendDeposit(sender.getSender(), toNano('1'));

        const senderWithdrawResult = await claim.sendWithdrawEmergency(sender.getSender(), toNano('0.05'));
        expect(senderWithdrawResult.transactions).toHaveTransaction({
            from: sender.address,
            to: claim.address,
            op: ClaimOpcodes.withdrawEmergency,
            aborted: true,
        });

        const adminWithdrawResult = await claim.sendWithdrawEmergency(deployer.getSender(), toNano('0.05'));
        expect(adminWithdrawResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: claim.address,
            op: ClaimOpcodes.withdrawEmergency,
            success: true,
        });
    });
});
