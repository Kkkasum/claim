import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type ClaimConfig = {
    adminAddress: Address;
    jettonMasterAddress: Address;
    jettonWalletCode: Cell;
    userContractCode: Cell;
};

export const Opcodes = {
    claim: 0xa769de27,
    firstClaim: 0x862ad82d,
    boost: 0x56642768,
    withdrawTon: 0x37726bdb,
    withdrawJetton: 0x11c09682,
    withdrawEmergency: 0x781282d4,
};

export const Error = {
    accessDenied: 100,
    notEnoughTon: 101,
};

export function claimConfigToCell(config: ClaimConfig): Cell {
    return beginCell()
        .storeAddress(config.adminAddress)
        .storeRef(beginCell().storeAddress(config.jettonMasterAddress).storeRef(config.jettonWalletCode).endCell())
        .storeRef(config.userContractCode)
        .endCell();
}

export class Claim implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Claim(address);
    }

    static createFromConfig(config: ClaimConfig, code: Cell, workchain = 0) {
        const data = claimConfigToCell(config);
        const init = { code, data };
        return new Claim(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendClaim(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            claimAmount: bigint;
            recepient: Address;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.claim, 32)
                .storeUint(0, 64)
                .storeCoins(opts.claimAmount)
                .storeAddress(opts.recepient)
                .endCell(),
        });
    }

    async sendFirstClaim(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            claimAmount: bigint;
            recepient: Address;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.firstClaim, 32)
                .storeUint(0, 64)
                .storeCoins(opts.claimAmount)
                .storeAddress(opts.recepient)
                .endCell(),
        });
    }

    async sendBoost(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address;
            boost: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.boost, 32)
                .storeUint(0, 64)
                .storeAddress(opts.userAddress)
                .storeCoins(opts.boost)
                .endCell(),
        });
    }

    async sendWithdrawTon(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            amount: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.withdrawTon, 32).storeUint(0, 64).storeCoins(opts.amount).endCell(),
        });
    }

    async sendWithdrawJetton(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            amount: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.withdrawJetton, 32).storeUint(0, 64).storeCoins(opts.amount).endCell(),
        });
    }

    async sendWithdrawEmergency(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            jettonAmount: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdrawEmergency, 32)
                .storeUint(0, 64)
                .storeCoins(opts.jettonAmount)
                .endCell(),
        });
    }

    async getBalance(provider: ContractProvider): Promise<bigint> {
        const result = await provider.getState();

        return result.balance;
    }

    async getUserContractAddress(provider: ContractProvider, userAddress: Address): Promise<Address> {
        const result = await provider.get('get_user_contract_address', [
            { type: 'slice', cell: beginCell().storeAddress(userAddress).endCell() },
        ]);

        return result.stack.readAddress();
    }
}
