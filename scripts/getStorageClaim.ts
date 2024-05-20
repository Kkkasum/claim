import { NetworkProvider } from '@ton/blueprint';
import { Address } from '@ton/core';
import { Claim } from '../wrappers/Claim';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Contract address: '));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const claim = provider.open(Claim.createFromAddress(address));

    const balance = await claim.getBalance();
    const jetton_wallet_address = await claim.getJettonWalletAddress();

    ui.write(`Balance: ${balance}`);
    ui.write(`Jetton Wallet Address: ${jetton_wallet_address}`);
}
