import { NetworkProvider, compile } from '@ton/blueprint';
import { toNano } from '@ton/core';
import { ADMIN_ADDRESS, JETTON_BYTE_CODE, JETTON_MASTER_ADDRESS, USER_ADDRESS } from '../helpers/constants';
import { Claim } from '../wrappers/Claim';
import { User } from '../wrappers/User';

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

    const user = provider.open(
        User.createFromConfig(
            {
                adminAddress: claim.address,
                userAddress: USER_ADDRESS,
            },
            await compile('User'),
        ),
    );

    await user.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(user.address);

    console.log('Balance: ', await user.getBalance());
}
