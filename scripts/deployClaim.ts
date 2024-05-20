import { NetworkProvider, compile } from '@ton/blueprint';
import { toNano } from '@ton/core';
import { ADMIN_ADDRESS, JETTON_BYTE_CODE, JETTON_MASTER_ADDRESS } from '../helpers/constants';
import { Claim } from '../wrappers/Claim';

export async function run(provider: NetworkProvider) {
    const claim = provider.open(
        Claim.createFromConfig(
            {
                adminAddress: ADMIN_ADDRESS,
                jettonMasterAddress: JETTON_MASTER_ADDRESS,
                jettonWalletCode: JETTON_BYTE_CODE,
                userContractCode: await compile('User'),
            },
            await compile('Claim'),
        ),
    );

    await claim.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(claim.address);

    console.log('Balance: ', await claim.getBalance());
}
