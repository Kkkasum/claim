import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

import { Claim, Opcodes } from '../wrappers/Claim';

describe('Claim', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Claim');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let claim: SandboxContract<Claim>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        claim = blockchain.openContract(Claim.createFromConfig({
            adminAddress: deployer.address,
            jettonMasterAddress: Address.parse('kQAyiCzg1aXZvo11trVJnpmJqD94egx6V1njV5fSlRCAPttg'),
            jettonWalletCode: Cell.fromBoc(Buffer.from('b5ee9c7201021101000323000114ff00f4a413f4bcf2c80b0102016202030202cc0405001ba0f605da89a1f401f481f481a8610201d40607020120080900c30831c02497c138007434c0c05c6c2544d7c0fc03383e903e900c7e800c5c75c87e800c7e800c1cea6d0000b4c7e08403e29fa954882ea54c4d167c0278208405e3514654882ea58c511100fc02b80d60841657c1ef2ea4d67c02f817c12103fcbc2000113e910c1c2ebcb853600201200a0b0083d40106b90f6a2687d007d207d206a1802698fc1080bc6a28ca9105d41083deecbef09dd0958f97162e99f98fd001809d02811e428027d012c678b00e78b6664f6aa401f1503d33ffa00fa4021f001ed44d0fa00fa40fa40d4305136a1522ac705f2e2c128c2fff2e2c254344270542013541403c85004fa0258cf1601cf16ccc922c8cb0112f400f400cb00c920f9007074c8cb02ca07cbffc9d004fa40f40431fa0020d749c200f2e2c4778018c8cb055008cf1670fa0217cb6b13cc80c0201200d0e009e8210178d4519c8cb1f19cb3f5007fa0222cf165006cf1625fa025003cf16c95005cc2391729171e25008a813a08209c9c380a014bcf2e2c504c98040fb001023c85004fa0258cf1601cf16ccc9ed5402f73b51343e803e903e90350c0234cffe80145468017e903e9014d6f1c1551cdb5c150804d50500f214013e809633c58073c5b33248b232c044bd003d0032c0327e401c1d3232c0b281f2fff274140371c1472c7cb8b0c2be80146a2860822625a019ad822860822625a028062849e5c412440e0dd7c138c34975c2c0600f1000d73b51343e803e903e90350c01f4cffe803e900c145468549271c17cb8b049f0bffcb8b08160824c4b402805af3cb8b0e0841ef765f7b232c7c572cfd400fe8088b3c58073c5b25c60063232c14933c59c3e80b2dab33260103ec01004f214013e809633c58073c5b3327b552000705279a018a182107362d09cc8cb1f5230cb3f58fa025007cf165007cf16c9718010c8cb0524cf165006fa0215cb6a14ccc971fb0010241023007cc30023c200b08e218210d53276db708010c8cb055008cf165004fa0216cb6a12cb1f12cb3fc972fb0093356c21e203c85004fa0258cf1601cf16ccc9ed54', 'hex'))[0]
        }, code));

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
            op: Opcodes.deposit,
            success: true,
        });

        const balance = await claim.getBalance();
        expect(balance).toBeGreaterThan(toNano('1'));
    });

    it('should claim', async () => {
        const sender = await blockchain.treasury('sender');
        const claimResult = await claim.sendClaim(sender.getSender(), toNano('0.25'), sender.address);
        
        expect(claimResult.transactions).toHaveTransaction({
            from: sender.address,
            to: claim.address,
            op: Opcodes.claim,
            success: true
        });
        expect(claimResult.transactions).toHaveTransaction({
            from: claim.address,
            to: sender.address,
            op: 0xf8a7ea5,
            success: true
        });
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

        const senderWithdrawResult = await claim.sendWithdrawEmergency(sender.getSender(), toNano('0.05'))
        expect(senderWithdrawResult.transactions).toHaveTransaction({
            from: sender.address,
            to: claim.address,
            op: Opcodes.withdraw_emergency,
            aborted: true
        });

        const adminWithdrawResult = await claim.sendWithdrawEmergency(deployer.getSender(), toNano('0.05'))
        expect(adminWithdrawResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: claim.address,
            op: Opcodes.withdraw_emergency,
            success: true
        });
    });
});
