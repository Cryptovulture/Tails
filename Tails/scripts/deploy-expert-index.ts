/**
 * ExpertIndex (MotoBasket) - Regtest Deployment Script
 *
 * Deploys the ExpertIndex contract with constructor calldata:
 *   - baseToken (Address) - BASKET token (MotoBasket base currency)
 *   - motoswapRouter (Address) - uses deployer as placeholder; update via proposeRouter() + executeRouterProposal()
 *   - batchRouter (Address) - read from deployed-addresses.json
 *   - treasury (Address) - deployer address
 *
 * Requires: BasketToken and BatchRouter must be deployed first (addresses in deployed-addresses.json).
 * Then updates motobasket-frontend/src/config/contracts.ts with the deployed address.
 *
 * Environment variables:
 *   MNEMONIC - 12/24-word seed phrase for a funded regtest wallet
 *
 * Usage:
 *   MNEMONIC="..." npm run deploy:expert-index
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
import { JSONRpcProvider } from 'opnet';
import { networks, type Network } from '@btc-vision/bitcoin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NETWORK: Network = networks.regtest;
const RPC_URL = 'https://regtest.opnet.org';
const FEE_RATE = 5;
const GAS_SAT_FEE = 30_000n;
const UTXO_POLL_INTERVAL_MS = 5_000;
const UTXO_POLL_MAX_ATTEMPTS = 24;

const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const FRONTEND_CONTRACTS_PATH = path.resolve(
    __dirname, '..', 'motobasket-frontend', 'src', 'config', 'contracts.ts',
);
const ADDRESSES_PATH = path.resolve(__dirname, 'deployed-addresses.json');

function requireEnv(name: string): string {
    const val = process.env[name];
    if (!val) {
        console.error(`ERROR: Missing environment variable ${name}`);
        console.error('');
        console.error('Usage:');
        console.error('  MNEMONIC="your seed phrase ..." npm run deploy:expert-index');
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

    throw new Error(`No UTXOs available for ${label} after ${UTXO_POLL_MAX_ATTEMPTS.toString()} attempts.`);
}

function updateFrontendConfig(expertIndexPubKey: string): void {
    console.log('\n--- Updating frontend contracts.ts ---');

    if (!fs.existsSync(FRONTEND_CONTRACTS_PATH)) {
        console.log('  Frontend contracts.ts not found — skipping frontend update.');
        return;
    }

    let content = fs.readFileSync(FRONTEND_CONTRACTS_PATH, 'utf-8');

    // Replace the EXPERT_INDEX_ADDRESS value
    content = content.replace(
        /export const EXPERT_INDEX_ADDRESS = '[^']*';/,
        `export const EXPERT_INDEX_ADDRESS = '${expertIndexPubKey}';`,
    );

    fs.writeFileSync(FRONTEND_CONTRACTS_PATH, content, 'utf-8');
    console.log(`  Updated EXPERT_INDEX_ADDRESS: ${expertIndexPubKey}`);
}

function updateDeployedAddresses(expertIndexPubKey: string): void {
    interface DeployedAddresses {
        motoToken: string;
        basketToken?: string;
        flipToken: string;
        tails: string;
        flipStaking: string;
        deployer: string;
        expertIndex?: string;
        batchRouter?: string;
    }

    let addresses: DeployedAddresses;
    if (fs.existsSync(ADDRESSES_PATH)) {
        addresses = JSON.parse(
            fs.readFileSync(ADDRESSES_PATH, 'utf-8'),
        ) as DeployedAddresses;
    } else {
        addresses = {
            motoToken: '',
            flipToken: '',
            tails: '',
            flipStaking: '',
            deployer: '',
        };
    }
    addresses.expertIndex = expertIndexPubKey;
    fs.writeFileSync(ADDRESSES_PATH, JSON.stringify(addresses, null, 2), 'utf-8');
    console.log(`  Addresses saved to: ${ADDRESSES_PATH}`);
}

async function main(): Promise<void> {
    console.log('=== ExpertIndex (MotoBasket) Deployment (Regtest) ===\n');

    const seedPhrase = requireEnv('MNEMONIC');

    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet: Wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`Deployer: ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const factory = new TransactionFactory();

    // Read deployed addresses (BasketToken + BatchRouter must exist)
    if (!fs.existsSync(ADDRESSES_PATH)) {
        console.error('ERROR: deployed-addresses.json not found. Deploy BasketToken and BatchRouter first.');
        process.exit(1);
    }
    const deployedAddresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, 'utf-8'));

    if (!deployedAddresses.basketToken) {
        console.error('ERROR: basketToken address not found. Deploy BasketToken first.');
        console.error('  Run: MNEMONIC="..." npm run deploy:basket-token');
        process.exit(1);
    }
    if (!deployedAddresses.batchRouter) {
        console.error('ERROR: batchRouter address not found. Deploy BatchRouter first.');
        console.error('  Run: MNEMONIC="..." npm run deploy:batch-router');
        process.exit(1);
    }

    const basketAddress = Address.fromString(deployedAddresses.basketToken as string);
    console.log(`BASKET token:    ${deployedAddresses.basketToken as string}`);

    // Use deployer's wallet.address as temporary router placeholder.
    // The contract owner can call proposeRouter() + executeRouterProposal() later with the real MotoSwap router.
    const routerPlaceholder: Address = wallet.address;
    console.log(`Router (temp):   deployer address (update via proposeRouter + executeRouterProposal)`);

    const batchRouterAddress = Address.fromString(deployedAddresses.batchRouter as string);
    console.log(`BatchRouter:     ${deployedAddresses.batchRouter as string}`);

    const treasuryAddress: Address = wallet.address;
    console.log(`Treasury:        deployer address`);

    const bytecode = readWasm('ExpertIndex.wasm');
    console.log(`\nBytecode size:   ${bytecode.length.toString()} bytes`);

    // Build calldata: baseToken (BASKET), motoswapRouter, batchRouter, treasury
    const calldata = new BinaryWriter();
    calldata.writeAddress(basketAddress);
    calldata.writeAddress(routerPlaceholder);
    calldata.writeAddress(batchRouterAddress);
    calldata.writeAddress(treasuryAddress);

    // Get UTXOs
    const utxos = await waitForUTXOs(provider, wallet.p2tr, 'ExpertIndex');

    // Get challenge
    const challenge = await provider.getChallenge();
    console.log('  Challenge obtained');

    // Sign deployment
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
        calldata: calldata.getBuffer(),
        challenge: challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    };

    console.log('\n--- Deploying ExpertIndex ---');
    const deployment: DeploymentResult = await factory.signDeployment(deploymentParams);
    console.log(`  P2OP address:  ${deployment.contractAddress}`);
    console.log(`  Contract key:  ${deployment.contractPubKey}`);

    // Send funding TX
    const fundingResult = await provider.sendRawTransaction(deployment.transaction[0], false);
    if (fundingResult.success) {
        console.log(`  Funding TX:  ${fundingResult.result ?? 'ok'}`);
    } else {
        console.error(`  Funding TX FAILED: ${fundingResult.error ?? 'unknown error'}`);
        throw new Error(`ExpertIndex funding TX failed: ${fundingResult.error ?? 'unknown'}`);
    }

    // Send reveal TX
    const revealResult = await provider.sendRawTransaction(deployment.transaction[1], false);
    if (revealResult.success) {
        console.log(`  Reveal TX:   ${revealResult.result ?? 'ok'}`);
    } else {
        console.error(`  Reveal TX FAILED: ${revealResult.error ?? 'unknown error'}`);
        throw new Error(`ExpertIndex reveal TX failed: ${revealResult.error ?? 'unknown'}`);
    }

    console.log('  ExpertIndex deployed!');

    // Update deployed-addresses.json
    updateDeployedAddresses(deployment.contractPubKey);

    // Update frontend config
    updateFrontendConfig(deployment.contractPubKey);

    // Summary
    console.log('\n=== Deployment Complete ===');
    console.log(`  ExpertIndex:   ${deployment.contractPubKey}`);
    console.log(`  BASKET Token:  ${deployedAddresses.basketToken as string}`);
    console.log(`  BatchRouter:   ${deployedAddresses.batchRouter as string}`);
    console.log(`  Router:        deployer (PLACEHOLDER - run npm run set-router with real MotoSwap router)`);
    console.log(`  Treasury:      ${wallet.p2tr}`);
    console.log(`\n  Frontend config updated at: ${FRONTEND_CONTRACTS_PATH}`);
    console.log('  Run "cd motobasket-frontend && npm run build" to rebuild.');
}

main().catch((err: unknown) => {
    console.error('\nDeployment failed:', err);
    process.exit(1);
});
