import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';
import { JettonWallet } from '@ton/ton';

export type ClaimConfig = {
    adminAddress: Address;
    // userContractAddress: Address;
    jettonMasterAddress: Address;
    jettonWalletCode: Cell;
};

export const Opcodes = {
    deposit: 0x95db9d39,
    claim: 0xa769de27,
    firstClaim: 0x862ad82d,
    withdrawTon: 0x37726bdb,
    withdrawJetton: 0x11c09682,
    withdrawEmergency: 0x781282d4,
    boost: 0x56642768,
};

export function claimConfigToCell(config: ClaimConfig): Cell {
    return beginCell()
        .storeAddress(config.adminAddress)
        .storeRef(
            beginCell()
                .storeAddress(config.jettonMasterAddress)
                .storeRef(config.jettonWalletCode)
            .endCell()
        )
    .endCell();
}

export class Claim implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

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

    async sendDeposit(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.deposit, 32)
                .storeInt(0, 64)
            .endCell(),
        });
    }

    async sendClaim(
        provider: ContractProvider, 
        via: Sender, 
        opts: {
            value: bigint, 
            claimAmount: bigint, 
            recepient: Address
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.claim, 32)
                .storeInt(0, 64)
                .storeCoins(opts.claimAmount)
                .storeAddress(opts.recepient)
            .endCell()
        })
    }

    async sendWithdrawTon(provider: ContractProvider, via: Sender,
        opts: {
            value: bigint,
            amount: bigint
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdrawTon, 32)
                .storeInt(0, 64)
                .storeCoins(opts.amount)
            .endCell(),
        });
    }

    async sendWithdrawJetton(provider: ContractProvider, via: Sender,
        opts: {
            value: bigint,
            amount: bigint
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdrawJetton, 32)
                .storeInt(0, 64)
                .storeCoins(opts.amount)
            .endCell(),
        });
    }

    async sendWithdrawEmergency(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdrawEmergency, 32)
                .storeInt(0, 64)
                .storeCoins(100)
            .endCell(),
        });
    }

    async getBalance(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_smc_balance', []);

        return result.stack.readNumber();
    }

    async getJettonWalletAddress(provider: ContractProvider): Promise<Address> {
        const storage = await provider.get('get_jetton_wallet_address', []);        

        return storage.stack.readAddress();
    }
}
