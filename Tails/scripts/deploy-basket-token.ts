/**
 * BasketToken - Regtest Deployment Script
 *
 * Deploys the BASKET token — the base currency for the MotoBasket protocol.
 * All basket investments, creator locks, and NAV are denominated in BASKET.
 *
 * 1 billion supply, 8 decimals, full supply minted to deployer.
 *
 * Environment variables:
 *   MNEMONIC - 12/24-word seed phrase for a funded regtest wallet
 *
 * Usage:
 *   MNEMONIC="..." npm run deploy:basket-token
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
    AddressTypes,
    type DeploymentResult,
    type IDeploymentParameters,
    TransactionFactory,
    type Wallet,
    Mnemonic,
    MLDSASecurityLevel,
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
const ADDRESSES_PATH = path.resolve(__dirname, 'deployed-addresses.json');
const FRONTEND_CONTRACTS_PATH = path.resolve(
    __dirname, '..', 'motobasket-frontend', 'src', 'config', 'contracts.ts',
);

function requireEnv(name: string): string {
    const val = process.env[name];
    if (!val) {
        console.error(`ERROR: Missing environment variable ${name}`);
        console.error('');
        console.error('Usage:');
        console.error('  MNEMONIC="your seed phrase ..." npm run deploy:basket-token');
        process.exit(1);
    }
    return val;
}

function readWasm(filename: string): Uint8Array {
    const filepath = path.join(BUILD_DIR, filename);
    if (!fs.existsSync(filepath)) {
        console.error(`ERROR: WASM file not found: ${filepath}`);
        console.error('Run "npm run build:baskettoken" first.');
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

function updateDeployedAddresses(basketTokenPubKey: string): void {
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
    addresses.basketToken = basketTokenPubKey;
    fs.writeFileSync(ADDRESSES_PATH, JSON.stringify(addresses, null, 2), 'utf-8');
    console.log(`  Addresses saved to: ${ADDRESSES_PATH}`);
}

function updateFrontendConfig(basketTokenPubKey: string): void {
    if (!fs.existsSync(FRONTEND_CONTRACTS_PATH)) {
        console.log('  Frontend contracts.ts not found — skipping frontend update.');
        return;
    }

    let content = fs.readFileSync(FRONTEND_CONTRACTS_PATH, 'utf-8');

    // Add or update BASKET_TOKEN_ADDRESS
    if (content.includes('BASKET_TOKEN_ADDRESS')) {
        content = content.replace(
            /export const BASKET_TOKEN_ADDRESS = '[^']*';/,
            `export const BASKET_TOKEN_ADDRESS = '${basketTokenPubKey}';`,
        );
    } else {
        // Append after the last export const
        content += `\n// BASKET token — MotoBasket base currency\nexport const BASKET_TOKEN_ADDRESS = '${basketTokenPubKey}';\n`;
    }

    fs.writeFileSync(FRONTEND_CONTRACTS_PATH, content, 'utf-8');
    console.log(`  Updated BASKET_TOKEN_ADDRESS in frontend config`);
}

async function main(): Promise<void> {
    console.log('=== BasketToken Deployment (Regtest) ===\n');

    const seedPhrase = requireEnv('MNEMONIC');

    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet: Wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`Deployer: ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const factory = new TransactionFactory();

    const bytecode = readWasm('BasketToken.wasm');
    console.log(`\nBytecode size:   ${bytecode.length.toString()} bytes`);

    // BasketToken has no constructor calldata — onDeployment() handles init
    const utxos = await waitForUTXOs(provider, wallet.p2tr, 'BasketToken');

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
        challenge: challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    };

    console.log('\n--- Deploying BasketToken ---');
    const deployment: DeploymentResult = await factory.signDeployment(deploymentParams);
    console.log(`  P2OP address:  ${deployment.contractAddress}`);
    console.log(`  Contract key:  ${deployment.contractPubKey}`);

    // Send funding TX
    const fundingResult = await provider.sendRawTransaction(deployment.transaction[0], false);
    if (fundingResult.success) {
        console.log(`  Funding TX:  ${fundingResult.result ?? 'ok'}`);
    } else {
        console.error(`  Funding TX FAILED: ${fundingResult.error ?? 'unknown error'}`);
        throw new Error(`BasketToken funding TX failed: ${fundingResult.error ?? 'unknown'}`);
    }

    // Send reveal TX
    const revealResult = await provider.sendRawTransaction(deployment.transaction[1], false);
    if (revealResult.success) {
        console.log(`  Reveal TX:   ${revealResult.result ?? 'ok'}`);
    } else {
        console.error(`  Reveal TX FAILED: ${revealResult.error ?? 'unknown error'}`);
        throw new Error(`BasketToken reveal TX failed: ${revealResult.error ?? 'unknown'}`);
    }

    console.log('  BasketToken deployed!');

    // Update deployed-addresses.json
    updateDeployedAddresses(deployment.contractPubKey);

    // Update frontend config
    updateFrontendConfig(deployment.contractPubKey);

    // Summary
    console.log('\n=== Deployment Complete ===');
    console.log(`  BasketToken:   ${deployment.contractPubKey}`);
    console.log(`  Symbol:        BASKET`);
    console.log(`  Decimals:      8`);
    console.log(`  Supply:        1,000,000,000 BASKET (minted to deployer)`);
    console.log(`\n  Full supply sent to deployer: ${wallet.p2tr}`);
    console.log(`\n  Next: Deploy BatchRouter and ExpertIndex with BASKET as the base token.`);
    console.log(`  Run: MNEMONIC="..." npm run deploy:batch-router`);
}

main().catch((err: unknown) => {
    console.error('\nDeployment failed:', err);
    process.exit(1);
});
