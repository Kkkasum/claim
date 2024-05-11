import { Address, toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { User } from '../wrappers/User';

export async function run(provider: NetworkProvider) {
    const user = provider.open(User.createFromConfig({
        adminAddress: Address.parse('EQA3It_9NCn1OWsEUzniY0VLw6lCEfDcbOYnlBjlrjy-ck9g'),
        userAddress: Address.parse('EQAZ3LMya7tedN2NWSmitV2lg5HR3RfMxPSVDVFZ3s8b9jwU'),
    }, await compile('User')));

    await user.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(user.address);

    console.log('Balance: ', await user.getBalance());
}
