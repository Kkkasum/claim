import { Address, Cell, Slice, TupleReader, TupleItem } from '@ton/core';
import { User } from '../wrappers/User';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Contract address: '));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const user = provider.open(User.createFromAddress(address));

    // const storage: TupleReader = await user.getStorage();

    // const adminAddress: Address = storage.readAddress();
    // const userAddress: Address = storage.readAddress();
    // const claimAmount: bigint = storage.readBigNumber();
    // const lastTransactionTime: number = storage.readNumber();

    const storage = await user.getStorage();

    const adminAddress = storage[0];
    const userAddress = storage[1];
    const claimAmount = storage[2];
    const lastTransactionTime = storage[3];
    
    ui.write(`Admin: ${adminAddress}`);
    ui.write(`User: ${userAddress}`);
    ui.write(`Claim amount: ${claimAmount}`);
    ui.write(`Last transaction at ${new Date(lastTransactionTime)}`);
}