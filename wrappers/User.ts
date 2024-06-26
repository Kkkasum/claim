import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';

export type UserConfig = {
    adminAddress: Address;
    userAddress: Address;
};

export const Opcodes = {
    claim: 0xa769de27,
    boost: 0x56642768,
    withdrawEmergency: 0x781282d4,
};

export const Error = {
    accessDenied: 100,
    notEnoughTon: 101,
    notYet: 102,
};

export function userConfigToCell(config: UserConfig): Cell {
    return beginCell()
        .storeAddress(config.adminAddress)
        .storeRef(beginCell().storeAddress(config.userAddress).storeCoins(toNano('1')).storeUint(0, 64).endCell())
        .endCell();
}

export class User implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new User(address);
    }

    static createFromConfig(config: UserConfig, code: Cell, workchain = 0) {
        const data = userConfigToCell(config);
        const init = { code, data };
        return new User(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendClaim(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.claim, 32).storeUint(0, 64).endCell(),
        });
    }

    async sendWithdrawEmergency(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.withdrawEmergency, 32).storeUint(0, 64).endCell(),
        });
    }

    async getBalance(provider: ContractProvider): Promise<bigint> {
        const result = await provider.getState();

        return result.balance;
    }

    async getStorage(provider: ContractProvider): Promise<[Address, Address, bigint, number]> {
        const result = await provider.get('get_storage', []);

        return [
            result.stack.readAddress(), // admin_address
            result.stack.readAddress(), // user_address
            result.stack.readBigNumber(), // claim_amount
            result.stack.readNumber(), // last_transaction_time
        ];
    }

    async getAdminAddress(provider: ContractProvider): Promise<Address> {
        const storage = await this.getStorage(provider);

        return storage[0];
    }

    async getUserAddress(provider: ContractProvider): Promise<Address> {
        const storage = await this.getStorage(provider);

        return storage[1];
    }

    async getClaimAmount(provider: ContractProvider): Promise<bigint> {
        const storage = await this.getStorage(provider);

        return storage[2];
    }

    async getClaimFee(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_claim_fee', []);

        return result.stack.readBigNumber();
    }

    async getLastTransactionTime(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_last_transaction_time', []);

        return result.stack.readNumber();
    }
}
