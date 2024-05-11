import { Address, toNano } from '@ton/core';
import { Claim } from '../wrappers/Claim';
import { NetworkProvider, sleep } from '@ton/blueprint';
import { JettonWallet } from '@ton/ton';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Contract address: '));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const claim = provider.open(Claim.createFromAddress(address));
    const claimAmount = toNano('1');

    const jettonWalletAddress = await claim.getJettonWalletAddress();
    const jettonWallet = provider.open(JettonWallet.create(jettonWalletAddress));

    const jettonWalletBalanceBefore = await jettonWallet.getBalance();

    await claim.sendClaim(
        provider.sender(), 
        {
            value: toNano('0.05'),
            claimAmount: claimAmount,
            recepient: Address.parse('UQAZ3LMya7tedN2NWSmitV2lg5HR3RfMxPSVDVFZ3s8b9mHR')
        }
    );

    ui.write('Waiting for claim...');

    let jettonWalletBalanceAfter = await jettonWallet.getBalance();
    let attempt = 1;
    while (jettonWalletBalanceBefore - jettonWalletBalanceAfter != claimAmount) {
        ui.setActionPrompt(`Attempt ${attempt}`);
        await sleep(2000);
        jettonWalletBalanceAfter = await jettonWallet.getBalance();
        attempt++;
    }
    
    ui.write(`${jettonWalletBalanceBefore} ${jettonWalletBalanceAfter}`);

    ui.clearActionPrompt();
    ui.write('Claimed!!!');
}