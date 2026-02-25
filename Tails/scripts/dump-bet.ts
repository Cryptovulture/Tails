/**
 * Dump raw getBet response to debug field order
 */
import {
    AddressTypes,
    Mnemonic,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import {
    JSONRpcProvider,
    getContract,
    ABIDataTypes,
    BitcoinAbiTypes,
} from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const NETWORK = networks.regtest;
const RPC_URL = 'https://regtest.opnet.org';
const TAILS_ADDRESS = '0x24d15e679086b3a0575d0028f8a593a14fa74471309ca7159ec5060a5dacb703';

// Try with 8 output fields to capture everything the contract might return
const abi: BitcoinInterfaceAbi = [
    {
        name: 'getBet',
        constant: true,
        inputs: [{ name: 'betId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'field0', type: ABIDataTypes.UINT256 },
            { name: 'field1', type: ABIDataTypes.UINT256 },
            { name: 'field2', type: ABIDataTypes.UINT256 },
            { name: 'field3', type: ABIDataTypes.UINT256 },
            { name: 'field4', type: ABIDataTypes.UINT256 },
            { name: 'field5', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
];

async function main() {
    const seedPhrase = process.env['MNEMONIC']!;
    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    const tails = getContract(TAILS_ADDRESS, abi, provider, NETWORK, wallet.address);
    // Try multiple IDs
    for (const id of [1n, 2n, 3n]) {
        console.log(`\n=== getBet(${id}) ===`);
        const result = await tails.getBet(id);
        const p2 = result.properties;
        for (let i = 0; i <= 5; i++) {
            const key = `field${i}`;
            const val: bigint = p2[key] ?? 0n;
            console.log(`  ${key}: ${val} (dec) | 0x${val.toString(16)} (hex) | ${Number(val) / 1e8} (as MOTO)`);
        }
    }
    const result = await tails.getBet(1n);
    const p = result.properties;

    console.log('=== Raw getBet(1) response ===');
    for (let i = 0; i <= 5; i++) {
        const key = `field${i}`;
        const val: bigint = p[key] ?? 0n;
        console.log(`  ${key}: ${val} (dec) | 0x${val.toString(16)} (hex) | ${Number(val) / 1e8} (as MOTO)`);
    }

    console.log(`\nWallet address hash: 0x${wallet.address.toHex().replace('0x', '')}`);
    console.log(`Wallet addr as bigint: ${BigInt(wallet.address.toHex())}`);
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
