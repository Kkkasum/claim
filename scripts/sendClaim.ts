import { NetworkProvider, sleep } from '@ton/blueprint';
import { Address, toNano } from '@ton/core';
import { JettonWallet } from '@ton/ton';
import { Claim } from '../wrappers/Claim';
import { User } from '../wrappers/User';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Contract address: '));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const user = provider.open(User.createFromAddress(address));

    const claimAddress = await user.getAdminAddress();
    const claimAmount = await user.getClaimAmount();
    const claimFee = await user.getClaimFee();

    const claim = provider.open(Claim.createFromAddress(claimAddress));

    const jettonWalletAddress = await claim.getJettonWalletAddress();
    const jettonWallet = provider.open(JettonWallet.create(jettonWalletAddress));

    const jettonWalletBalanceBefore = await jettonWallet.getBalance();
    const lastTransactionTimeBefore = await user.getLastTransactionTime();

    if (lastTransactionTimeBefore + 86400 > Date.now()) {
        ui.write(`You can claim after: ${lastTransactionTimeBefore + 86400}`);
        return;
    }

    await user.sendClaim(provider.sender(), claimFee + toNano('0.05'));

    ui.write('Waiting for claim...');

    let jettonWalletBalanceAfter = await jettonWallet.getBalance();
    let lastTransactionTimeAfter = await user.getLastTransactionTime();
    let attempt = 1;
    while (
        jettonWalletBalanceBefore - jettonWalletBalanceAfter != claimAmount ||
        lastTransactionTimeBefore === lastTransactionTimeAfter
    ) {
        ui.setActionPrompt(`Attempt ${attempt}`);
        await sleep(2000);
        jettonWalletBalanceAfter = await jettonWallet.getBalance();
        lastTransactionTimeAfter = await user.getLastTransactionTime();
        attempt++;
    }

    ui.write(`${jettonWalletBalanceBefore} -> ${jettonWalletBalanceAfter}`);
    ui.write(`${lastTransactionTimeBefore} -> ${lastTransactionTimeAfter}`);

    ui.clearActionPrompt();
    ui.write('Claimed!!!');
}
