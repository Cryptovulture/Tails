/**
 * Tails Protocol - Configure deployed contracts
 *
 * Reads deployed addresses from deployed-addresses.json and configures Tails:
 *   - setFlipToken(flipAddress)
 *   - setStakingContract(stakingAddress)
 *   - setTreasury(deployerAddress)
 *
 * Then updates frontend/src/config/contracts.ts
 *
 * Usage:
 *   MNEMONIC="..." npm run configure
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
    AddressTypes,
    type Wallet,
    Mnemonic,
    MLDSASecurityLevel,
    Address,
    type UTXO,
} from '@btc-vision/transaction';
import {
    JSONRpcProvider,
    getContract,
    ABIDataTypes,
    BitcoinAbiTypes,
    type BitcoinInterfaceAbi,
} from 'opnet';
import { networks, type Network } from '@btc-vision/bitcoin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NETWORK: Network = networks.regtest;
const RPC_URL = 'https://regtest.opnet.org';
const FEE_RATE = 5;
const MAX_SAT_TO_SPEND = 100_000n;
const RETRY_INTERVAL_MS = 10_000;
const RETRY_MAX_ATTEMPTS = 60;

const FRONTEND_CONTRACTS_PATH = path.resolve(
    __dirname, '..', 'frontend', 'src', 'config', 'contracts.ts',
);

interface DeployedAddresses {
    motoToken: string;
    flipToken: string;
    tails: string;
    flipStaking: string;
    deployer: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const TAILS_CONFIG_ABI: BitcoinInterfaceAbi = [
    {
        name: 'setFlipToken',
        inputs: [{ name: 'flipToken', type: ABIDataTypes.ADDRESS }],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setStakingContract',
        inputs: [{ name: 'stakingContract', type: ABIDataTypes.ADDRESS }],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setTreasury',
        inputs: [{ name: 'treasury', type: ABIDataTypes.ADDRESS }],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
];

async function callContractMethod(
    provider: JSONRpcProvider,
    wallet: Wallet,
    contractPubKey: string,
    abi: BitcoinInterfaceAbi,
    methodName: string,
    args: unknown[],
    label: string,
): Promise<void> {
    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
        try {
            console.log(`  Calling ${label} (attempt ${attempt.toString()})...`);

            const contract = getContract(
                contractPubKey,
                abi,
                provider,
                NETWORK,
                wallet.address,
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const method = (contract as any)[methodName];
            if (!method) {
                throw new Error(`Method ${methodName} not found on contract`);
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const simulation = await method.call(contract, ...args);

            const utxos: UTXO[] = await provider.utxoManager.getUTXOs({
                address: wallet.p2tr,
            });

            if (utxos.length === 0) {
                throw new Error('No UTXOs available');
            }

            const receipt = await simulation.sendTransaction({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                refundTo: wallet.p2tr,
                maximumAllowedSatToSpend: MAX_SAT_TO_SPEND,
                feeRate: FEE_RATE,
                network: NETWORK,
                utxos: utxos,
            });

            console.log(`  ${label} TX: ${String(receipt.transactionId ?? 'ok')}`);
            return;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('Invalid contract') && attempt < RETRY_MAX_ATTEMPTS) {
                console.log(`  Contract not confirmed yet, retrying in ${(RETRY_INTERVAL_MS / 1000).toString()}s...`);
                await sleep(RETRY_INTERVAL_MS);
                continue;
            }
            throw err;
        }
    }
}

function updateFrontendConfig(addresses: DeployedAddresses): void {
    console.log('\n--- Updating frontend contracts.ts ---');

    // Read existing config to preserve ExpertIndex / MotoBasket constants
    let expertIndexAddress = '';
    let creatorLockMoto = '1_000';
    if (fs.existsSync(FRONTEND_CONTRACTS_PATH)) {
        const existing = fs.readFileSync(FRONTEND_CONTRACTS_PATH, 'utf-8');
        const eiMatch = /EXPERT_INDEX_ADDRESS\s*=\s*'([^']*)'/.exec(existing);
        if (eiMatch) {
            expertIndexAddress = eiMatch[1] ?? '';
        }
        const clMatch = /CREATOR_LOCK_MOTO\s*=\s*([^;]+)/.exec(existing);
        if (clMatch) {
            creatorLockMoto = clMatch[1]?.trim() ?? '1_000';
        }
    }

    const content = `import { networks } from '@btc-vision/bitcoin';
import type { Network } from '@btc-vision/bitcoin';

export const TAILS_ADDRESS = '${addresses.tails}';
export const FLIP_TOKEN_ADDRESS = '${addresses.flipToken}';
export const STAKING_ADDRESS = '${addresses.flipStaking}';
export const MOTO_TOKEN_ADDRESS = '${addresses.motoToken}';

export const NETWORK: Network = networks.regtest;
export const RPC_URL = 'https://regtest.opnet.org';

export const EXPERT_INDEX_ADDRESS = '${expertIndexAddress}';
export const CREATOR_LOCK_MOTO = ${creatorLockMoto};

export const MOTO_DECIMALS = 8;
export const FLIP_DECIMALS = 18;

export const BET_TIERS: readonly { index: number; label: string; moto: number }[] = [
    { index: 0, label: '10', moto: 10 },
    { index: 1, label: '25', moto: 25 },
    { index: 2, label: '50', moto: 50 },
    { index: 3, label: '100', moto: 100 },
    { index: 4, label: '250', moto: 250 },
    { index: 5, label: '500', moto: 500 },
    { index: 6, label: '1K', moto: 1_000 },
    { index: 7, label: '2.5K', moto: 2_500 },
    { index: 8, label: '5K', moto: 5_000 },
    { index: 9, label: '10K', moto: 10_000 },
    { index: 10, label: '25K', moto: 25_000 },
    { index: 11, label: '50K', moto: 50_000 },
    { index: 12, label: '100K', moto: 100_000 },
] as const;
`;

    fs.writeFileSync(FRONTEND_CONTRACTS_PATH, content, 'utf-8');
    console.log(`  Updated: ${FRONTEND_CONTRACTS_PATH}`);
}

async function main(): Promise<void> {
    console.log('=== Tails Protocol Configuration ===\n');

    const seedPhrase = process.env['MNEMONIC'];
    if (!seedPhrase) {
        console.error('ERROR: Missing MNEMONIC environment variable');
        process.exit(1);
    }

    const addressesPath = path.resolve(__dirname, 'deployed-addresses.json');
    if (!fs.existsSync(addressesPath)) {
        console.error('ERROR: deployed-addresses.json not found. Run deploy first.');
        process.exit(1);
    }

    const addresses: DeployedAddresses = JSON.parse(
        fs.readFileSync(addressesPath, 'utf-8'),
    ) as DeployedAddresses;

    console.log('Deployed addresses:');
    console.log(`  MOTO Token:   ${addresses.motoToken}`);
    console.log(`  FLIPToken:    ${addresses.flipToken}`);
    console.log(`  Tails:        ${addresses.tails}`);
    console.log(`  FLIPStaking:  ${addresses.flipStaking}`);

    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`\nDeployer: ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    console.log('\n--- Configuring Tails ---');

    await callContractMethod(
        provider, wallet, addresses.tails, TAILS_CONFIG_ABI,
        'setFlipToken', [Address.fromString(addresses.flipToken)],
        'setFlipToken',
    );

    await callContractMethod(
        provider, wallet, addresses.tails, TAILS_CONFIG_ABI,
        'setStakingContract', [Address.fromString(addresses.flipStaking)],
        'setStakingContract',
    );

    await callContractMethod(
        provider, wallet, addresses.tails, TAILS_CONFIG_ABI,
        'setTreasury', [wallet.address],
        'setTreasury',
    );

    updateFrontendConfig(addresses);

    console.log('\n=== Configuration Complete ===');
}

main().catch((err: unknown) => {
    console.error('\nConfiguration failed:', err);
    process.exit(1);
});
