/**
 * BatchRouter - Regtest Deployment Script
 *
 * Deploys the BatchRouter contract with constructor calldata:
 *   - baseToken (Address) - BASKET token (MotoBasket base currency)
 *   - routerAddress (Address) - MotoSwap router; uses deployer as placeholder
 *
 * Requires: BasketToken must be deployed first (address in deployed-addresses.json).
 *
 * Environment variables:
 *   MNEMONIC - 12/24-word seed phrase for a funded regtest wallet
 *
 * Usage:
 *   MNEMONIC="..." npm run deploy:batch-router
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

const BATCH_ROUTER_WASM = path.resolve(__dirname, '..', 'batch-router', 'build', 'BatchRouter.wasm');
const ADDRESSES_PATH = path.resolve(__dirname, 'deployed-addresses.json');

function requireEnv(name: string): string {
    const val = process.env[name];
    if (!val) {
        console.error(`ERROR: Missing environment variable ${name}`);
        console.error('');
        console.error('Usage:');
        console.error('  MNEMONIC="your seed phrase ..." npm run deploy:batch-router');
        process.exit(1);
    }
    return val;
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

function updateDeployedAddresses(batchRouterPubKey: string): void {
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
    addresses.batchRouter = batchRouterPubKey;
    fs.writeFileSync(ADDRESSES_PATH, JSON.stringify(addresses, null, 2), 'utf-8');
    console.log(`  Addresses saved to: ${ADDRESSES_PATH}`);
}

async function main(): Promise<void> {
    console.log('=== BatchRouter Deployment (Regtest) ===\n');

    const seedPhrase = requireEnv('MNEMONIC');

    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet: Wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`Deployer: ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const factory = new TransactionFactory();

    // Read BASKET token address from deployed-addresses.json
    if (!fs.existsSync(ADDRESSES_PATH)) {
        console.error('ERROR: deployed-addresses.json not found. Deploy BasketToken first.');
        process.exit(1);
    }
    const deployedAddresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, 'utf-8'));
    if (!deployedAddresses.basketToken) {
        console.error('ERROR: basketToken address not found. Deploy BasketToken first.');
        console.error('  Run: MNEMONIC="..." npm run deploy:basket-token');
        process.exit(1);
    }
    const basketAddress = Address.fromString(deployedAddresses.basketToken as string);
    console.log(`BASKET token:    ${deployedAddresses.basketToken as string}`);

    // Use deployer as temporary MotoSwap router placeholder.
    // Owner can call setRouter() later with the real address.
    const routerPlaceholder: Address = wallet.address;
    console.log(`Router (temp):   deployer address (update via setRouter)`);

    // Read WASM
    if (!fs.existsSync(BATCH_ROUTER_WASM)) {
        console.error(`ERROR: WASM file not found: ${BATCH_ROUTER_WASM}`);
        console.error('Run "npm run build" in batch-router/ first.');
        process.exit(1);
    }
    const bytecode = new Uint8Array(fs.readFileSync(BATCH_ROUTER_WASM));
    console.log(`\nBytecode size:   ${bytecode.length.toString()} bytes`);

    // Build calldata: baseToken (BASKET), routerAddress
    const calldata = new BinaryWriter();
    calldata.writeAddress(basketAddress);
    calldata.writeAddress(routerPlaceholder);

    // Get UTXOs
    const utxos = await waitForUTXOs(provider, wallet.p2tr, 'BatchRouter');

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

    console.log('\n--- Deploying BatchRouter ---');
    const deployment: DeploymentResult = await factory.signDeployment(deploymentParams);
    console.log(`  P2OP address:  ${deployment.contractAddress}`);
    console.log(`  Contract key:  ${deployment.contractPubKey}`);

    // Send funding TX
    const fundingResult = await provider.sendRawTransaction(deployment.transaction[0], false);
    if (fundingResult.success) {
        console.log(`  Funding TX:  ${fundingResult.result ?? 'ok'}`);
    } else {
        console.error(`  Funding TX FAILED: ${fundingResult.error ?? 'unknown error'}`);
        throw new Error(`BatchRouter funding TX failed: ${fundingResult.error ?? 'unknown'}`);
    }

    // Send reveal TX
    const revealResult = await provider.sendRawTransaction(deployment.transaction[1], false);
    if (revealResult.success) {
        console.log(`  Reveal TX:   ${revealResult.result ?? 'ok'}`);
    } else {
        console.error(`  Reveal TX FAILED: ${revealResult.error ?? 'unknown error'}`);
        throw new Error(`BatchRouter reveal TX failed: ${revealResult.error ?? 'unknown'}`);
    }

    console.log('  BatchRouter deployed!');

    // Update deployed-addresses.json
    updateDeployedAddresses(deployment.contractPubKey);

    // Summary
    console.log('\n=== Deployment Complete ===');
    console.log(`  BatchRouter:   ${deployment.contractPubKey}`);
    console.log(`  BASKET Token:  ${deployedAddresses.basketToken as string}`);
    console.log(`  Router:        deployer (PLACEHOLDER - call setRouter with real MotoSwap router)`);
}

main().catch((err: unknown) => {
    console.error('\nDeployment failed:', err);
    process.exit(1);
});
