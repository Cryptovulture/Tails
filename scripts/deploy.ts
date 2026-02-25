/**
 * Tails Protocol - Regtest Deployment Script
 *
 * Deploys three contracts in order:
 *   1. FLIPToken (no constructor calldata)
 *   2. Tails  (calldata: MOTO token address)
 *   3. FLIPStaking (calldata: FLIP address + MOTO address)
 *
 * Then configures Tails with:
 *   - setFlipToken(flipAddress)
 *   - setStakingContract(stakingAddress)
 *   - setTreasury(deployerAddress)
 *
 * Environment variables:
 *   MNEMONIC - 12/24-word seed phrase for a funded regtest wallet
 *
 * Usage:
 *   cd scripts && npm install && MNEMONIC="..." npm run deploy
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
    AddressTypes,
    BinaryWriter,
    type DeploymentResult,
    type IDeploymentParameters,
    TransactionFactory,
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
const GAS_SAT_FEE = 30_000n;
const MAX_SAT_TO_SPEND = 100_000n;
const UTXO_POLL_INTERVAL_MS = 5_000;
const UTXO_POLL_MAX_ATTEMPTS = 24;
const CONFIG_RETRY_INTERVAL_MS = 10_000;
const CONFIG_RETRY_MAX_ATTEMPTS = 60;

const MOTO_ADDRESS_HEX = '0x0a6732489a31e6de07917a28ff7df311fc5f98f6e1664943ac1c3fe7893bdab5';

const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const FRONTEND_CONTRACTS_PATH = path.resolve(
    __dirname, '..', 'frontend', 'src', 'config', 'contracts.ts',
);

function requireEnv(name: string): string {
    const val = process.env[name];
    if (!val) {
        console.error(`ERROR: Missing environment variable ${name}`);
        console.error('');
        console.error('Usage:');
        console.error('  MNEMONIC="your seed phrase ..." npm run deploy');
        process.exit(1);
    }
    return val;
}

function readWasm(filename: string): Uint8Array {
    const filepath = path.join(BUILD_DIR, filename);
    if (!fs.existsSync(filepath)) {
        console.error(`ERROR: WASM file not found: ${filepath}`);
        console.error('Run "npm run build" in the project root first.');
        process.exit(1);
    }
    return new Uint8Array(fs.readFileSync(filepath));
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForNewBlock(
    provider: JSONRpcProvider,
    startBlock: bigint,
    label: string,
): Promise<bigint> {
    console.log(`\n  Waiting for block confirmation (current: ${startBlock.toString()})...`);
    for (let attempt = 1; attempt <= UTXO_POLL_MAX_ATTEMPTS; attempt++) {
        await sleep(UTXO_POLL_INTERVAL_MS);
        const currentBlock = await provider.getBlockNumber();
        if (currentBlock > startBlock) {
            console.log(`  Block confirmed: ${currentBlock.toString()} (${label})`);
            return currentBlock;
        }
        console.log(`  Still at block ${currentBlock.toString()} (attempt ${attempt.toString()})...`);
    }
    throw new Error(`Timed out waiting for block confirmation after ${label}`);
}

async function waitForUTXOs(
    provider: JSONRpcProvider,
    walletAddress: string,
    label: string,
): Promise<UTXO[]> {
    for (let attempt = 1; attempt <= UTXO_POLL_MAX_ATTEMPTS; attempt++) {
        const utxos = await provider.utxoManager.getUTXOs({
            address: walletAddress,
        });

        if (utxos.length > 0) {
            console.log(`  UTXOs available: ${utxos.length.toString()} (attempt ${attempt.toString()})`);
            return utxos;
        }

        console.log(`  Waiting for UTXOs (attempt ${attempt.toString()}/${UTXO_POLL_MAX_ATTEMPTS.toString()})...`);
        await sleep(UTXO_POLL_INTERVAL_MS);
    }

    throw new Error(`No UTXOs available for ${label} after ${UTXO_POLL_MAX_ATTEMPTS.toString()} attempts. Fund wallet: ${walletAddress}`);
}

interface DeployResult {
    contractAddress: string;
    contractPubKey: string;
    changeUtxos: UTXO[];
}

async function deployContract(
    provider: JSONRpcProvider,
    factory: TransactionFactory,
    wallet: Wallet,
    bytecode: Uint8Array,
    calldata: Uint8Array | undefined,
    label: string,
    previousUtxos?: UTXO[],
): Promise<DeployResult> {
    console.log(`\n--- Deploying ${label} ---`);

    const utxos = previousUtxos && previousUtxos.length > 0
        ? previousUtxos
        : await waitForUTXOs(provider, wallet.p2tr, label);

    console.log(`  UTXOs: ${utxos.length.toString()} (${previousUtxos ? 'from previous deploy' : 'from provider'})`);

    const challenge = await provider.getChallenge();
    console.log('  Challenge obtained');

    const deploymentParams: IDeploymentParameters = {
        from: wallet.p2tr,
        utxos: utxos,
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        network: NETWORK,
        feeRate: FEE_RATE,
        priorityFee: 0n,
        gasSatFee: GAS_SAT_FEE,
        bytecode: bytecode,
        calldata: calldata,
        challenge: challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    };

    const deployment: DeploymentResult = await factory.signDeployment(deploymentParams);
    console.log(`  P2OP address:  ${deployment.contractAddress}`);
    console.log(`  Contract key:  ${deployment.contractPubKey}`);

    const fundingResult = await provider.sendRawTransaction(deployment.transaction[0], false);
    if (fundingResult.success) {
        console.log(`  Funding TX:  ${fundingResult.result ?? 'ok'}`);
    } else {
        console.error(`  Funding TX FAILED: ${fundingResult.error ?? 'unknown error'}`);
        throw new Error(`${label} funding TX failed: ${fundingResult.error ?? 'unknown'}`);
    }

    const revealResult = await provider.sendRawTransaction(deployment.transaction[1], false);
    if (revealResult.success) {
        console.log(`  Reveal TX:   ${revealResult.result ?? 'ok'}`);
    } else {
        console.error(`  Reveal TX FAILED: ${revealResult.error ?? 'unknown error'}`);
        throw new Error(`${label} reveal TX failed: ${revealResult.error ?? 'unknown'}`);
    }

    console.log(`  ${label} deployed!`);
    return {
        contractAddress: deployment.contractAddress,
        contractPubKey: deployment.contractPubKey,
        changeUtxos: deployment.utxos,
    };
}

async function callContractMethod(
    provider: JSONRpcProvider,
    wallet: Wallet,
    contractPubKey: string,
    abi: BitcoinInterfaceAbi,
    methodName: string,
    args: unknown[],
    label: string,
): Promise<void> {
    for (let attempt = 1; attempt <= CONFIG_RETRY_MAX_ATTEMPTS; attempt++) {
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

            const utxos = await waitForUTXOs(provider, wallet.p2tr, label);

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
            if (msg.includes('Invalid contract') && attempt < CONFIG_RETRY_MAX_ATTEMPTS) {
                console.log(`  Contract not confirmed yet, retrying in ${(CONFIG_RETRY_INTERVAL_MS / 1000).toString()}s...`);
                await sleep(CONFIG_RETRY_INTERVAL_MS);
                continue;
            }
            throw err;
        }
    }
}

function updateFrontendConfig(
    tailsPubKey: string,
    flipTokenPubKey: string,
    stakingPubKey: string,
    motoTokenAddress: string,
): void {
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

export const TAILS_ADDRESS = '${tailsPubKey}';
export const FLIP_TOKEN_ADDRESS = '${flipTokenPubKey}';
export const STAKING_ADDRESS = '${stakingPubKey}';
export const MOTO_TOKEN_ADDRESS = '${motoTokenAddress}';

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

async function main(): Promise<void> {
    console.log('=== Tails Protocol Deployment (Regtest) ===\n');

    const seedPhrase = requireEnv('MNEMONIC');

    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`Deployer: ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const factory = new TransactionFactory();

    const motoAddress = Address.fromString(MOTO_ADDRESS_HEX);
    console.log(`MOTO address: ${MOTO_ADDRESS_HEX}`);

    const flipTokenBytecode = readWasm('FLIPToken.wasm');
    const tailsBytecode = readWasm('Tails.wasm');
    const flipStakingBytecode = readWasm('FLIPStaking.wasm');

    console.log(`\nBytecode sizes:`);
    console.log(`  FLIPToken:    ${flipTokenBytecode.length.toString()} bytes`);
    console.log(`  Tails:        ${tailsBytecode.length.toString()} bytes`);
    console.log(`  FLIPStaking:  ${flipStakingBytecode.length.toString()} bytes`);

    // Step 1: Deploy FLIPToken (no calldata)
    const flipToken = await deployContract(
        provider, factory, wallet, flipTokenBytecode, undefined, 'FLIPToken',
    );

    // Step 2: Deploy Tails (calldata: MOTO address)
    // Use change UTXOs from previous deployment to avoid UTXO conflicts
    const tailsCalldata = new BinaryWriter();
    tailsCalldata.writeAddress(motoAddress);

    const tails = await deployContract(
        provider, factory, wallet, tailsBytecode,
        tailsCalldata.getBuffer(), 'Tails',
        flipToken.changeUtxos,
    );

    // Step 3: Deploy FLIPStaking (calldata: FLIP + MOTO addresses)
    const stakingCalldata = new BinaryWriter();
    stakingCalldata.writeAddress(Address.fromString(flipToken.contractPubKey));
    stakingCalldata.writeAddress(motoAddress);

    const staking = await deployContract(
        provider, factory, wallet, flipStakingBytecode,
        stakingCalldata.getBuffer(), 'FLIPStaking',
        tails.changeUtxos,
    );

    // Save addresses immediately so they're not lost
    const deployedAddresses = {
        motoToken: MOTO_ADDRESS_HEX,
        flipToken: flipToken.contractPubKey,
        tails: tails.contractPubKey,
        flipStaking: staking.contractPubKey,
        deployer: wallet.p2tr,
    };
    const addressesPath = path.resolve(__dirname, 'deployed-addresses.json');
    fs.writeFileSync(addressesPath, JSON.stringify(deployedAddresses, null, 2), 'utf-8');
    console.log(`\n  Addresses saved to: ${addressesPath}`);

    // Step 4: Configure Tails (retries until contracts are confirmed)
    console.log('\n--- Configuring Tails ---');

    await callContractMethod(
        provider, wallet, tails.contractPubKey, TAILS_CONFIG_ABI,
        'setFlipToken', [Address.fromString(flipToken.contractPubKey)],
        'setFlipToken',
    );

    await callContractMethod(
        provider, wallet, tails.contractPubKey, TAILS_CONFIG_ABI,
        'setStakingContract', [Address.fromString(staking.contractPubKey)],
        'setStakingContract',
    );

    await callContractMethod(
        provider, wallet, tails.contractPubKey, TAILS_CONFIG_ABI,
        'setTreasury', [wallet.address],
        'setTreasury',
    );

    // Step 5: Update frontend config with hex (contractPubKey) addresses
    updateFrontendConfig(
        tails.contractPubKey,
        flipToken.contractPubKey,
        staking.contractPubKey,
        MOTO_ADDRESS_HEX,
    );

    // Summary
    console.log('\n=== Deployment Complete ===');
    console.log(`  MOTO Token:   ${MOTO_ADDRESS_HEX}`);
    console.log(`  FLIPToken:    ${flipToken.contractPubKey}`);
    console.log(`  Tails:        ${tails.contractPubKey}`);
    console.log(`  FLIPStaking:  ${staking.contractPubKey}`);
    console.log(`  Treasury:     ${wallet.p2tr} (deployer)`);
    console.log(`\n  Frontend config updated at: ${FRONTEND_CONTRACTS_PATH}`);
    console.log('  Run "cd frontend && npm run build" to rebuild.');
}

main().catch((err: unknown) => {
    console.error('\nDeployment failed:', err);
    process.exit(1);
});
