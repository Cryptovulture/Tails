/**
 * IndexShareToken - Regtest Deployment Script
 *
 * Deploys an IndexShareToken (mintable OP20) for a specific MotoBasket index.
 * Only the minter (ExpertIndex) can mint/burn shares.
 *
 * Constructor calldata:
 *   minter: Address      — ExpertIndex contract address
 *   maxSupply: u256      — 1 billion * 10^8
 *   decimals: u256       — 8
 *   nameLen: u256        — name length
 *   nameBytes: u256[]    — one u256 per character byte
 *   symbolLen: u256      — symbol length
 *   symbolBytes: u256[]  — one u256 per character byte
 *
 * Environment variables:
 *   MNEMONIC - 12/24-word seed phrase for a funded regtest wallet
 *
 * Usage:
 *   MNEMONIC="..." tsx deploy-share-token.ts "FLIP-ODYS Index Shares" "sFLIPODYS"
 *
 * Or import deployShareToken() from create-indexes.ts for automated deployment.
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
const ADDRESSES_PATH = path.resolve(__dirname, 'deployed-addresses.json');

const MAX_SUPPLY = 1_000_000_000n * 100_000_000n; // 1B tokens with 8 decimals
const DECIMALS = 8n;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function readWasm(filename: string): Uint8Array {
    const filepath = path.join(BUILD_DIR, filename);
    if (!fs.existsSync(filepath)) {
        console.error(`ERROR: WASM file not found: ${filepath}`);
        console.error('Run "npm run build:sharetoken" first.');
        process.exit(1);
    }
    return new Uint8Array(fs.readFileSync(filepath));
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

/**
 * Deploy an IndexShareToken with the given name/symbol.
 * Returns the deployed contract's public key (0x...).
 */
export async function deployShareToken(
    provider: JSONRpcProvider,
    wallet: Wallet,
    minterAddress: string,
    tokenName: string,
    tokenSymbol: string,
): Promise<string> {
    console.log(`\n--- Deploying IndexShareToken: "${tokenName}" (${tokenSymbol}) ---`);

    const bytecode = readWasm('IndexShareToken.wasm');
    console.log(`  Bytecode size: ${bytecode.length.toString()} bytes`);

    const minterAddr = Address.fromString(minterAddress);

    // Build constructor calldata
    const calldata = new BinaryWriter();
    calldata.writeAddress(minterAddr);        // minter (ExpertIndex)
    calldata.writeU256(MAX_SUPPLY);           // maxSupply
    calldata.writeU256(DECIMALS);             // decimals

    // Name (length-prefixed, one u256 per byte)
    const nameBytes = new TextEncoder().encode(tokenName);
    calldata.writeU256(BigInt(nameBytes.length));
    for (let i = 0; i < nameBytes.length; i++) {
        calldata.writeU256(BigInt(nameBytes[i]));
    }

    // Symbol (length-prefixed, one u256 per byte)
    const symbolBytes = new TextEncoder().encode(tokenSymbol);
    calldata.writeU256(BigInt(symbolBytes.length));
    for (let i = 0; i < symbolBytes.length; i++) {
        calldata.writeU256(BigInt(symbolBytes[i]));
    }

    const utxos = await waitForUTXOs(provider, wallet.p2tr, `ShareToken(${tokenSymbol})`);

    const challenge = await provider.getChallenge();
    console.log('  Challenge obtained');

    const factory = new TransactionFactory();
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

    const deployment: DeploymentResult = await factory.signDeployment(deploymentParams);
    console.log(`  P2OP address:  ${deployment.contractAddress}`);
    console.log(`  Contract key:  ${deployment.contractPubKey}`);

    // Send funding TX
    const fundingResult = await provider.sendRawTransaction(deployment.transaction[0], false);
    if (fundingResult.success) {
        console.log(`  Funding TX:  ${fundingResult.result ?? 'ok'}`);
    } else {
        console.error(`  Funding TX FAILED: ${fundingResult.error ?? 'unknown error'}`);
        throw new Error(`ShareToken funding TX failed: ${fundingResult.error ?? 'unknown'}`);
    }

    // Send reveal TX
    const revealResult = await provider.sendRawTransaction(deployment.transaction[1], false);
    if (revealResult.success) {
        console.log(`  Reveal TX:   ${revealResult.result ?? 'ok'}`);
    } else {
        console.error(`  Reveal TX FAILED: ${revealResult.error ?? 'unknown error'}`);
        throw new Error(`ShareToken reveal TX failed: ${revealResult.error ?? 'unknown'}`);
    }

    console.log(`  IndexShareToken "${tokenSymbol}" deployed!`);
    return deployment.contractPubKey;
}

// ── Standalone CLI usage (only runs when executed directly) ───────────

const isMainModule = process.argv[1]?.includes('deploy-share-token');

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: MNEMONIC="..." tsx deploy-share-token.ts "Token Name" "SYMBOL"');
        process.exit(1);
    }

    const tokenName = args[0];
    const tokenSymbol = args[1];

    const seedPhrase = process.env['MNEMONIC'];
    if (!seedPhrase) {
        console.error('ERROR: Missing MNEMONIC environment variable');
        process.exit(1);
    }

    if (!fs.existsSync(ADDRESSES_PATH)) {
        console.error('ERROR: deployed-addresses.json not found.');
        process.exit(1);
    }

    const addresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, 'utf-8'));
    const expertIndexAddress = addresses.expertIndex as string;
    if (!expertIndexAddress) {
        console.error('ERROR: expertIndex not found in deployed-addresses.json');
        process.exit(1);
    }

    console.log('=== IndexShareToken Deployment (Regtest) ===\n');

    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet: Wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`Deployer:      ${wallet.p2tr}`);
    console.log(`Minter:        ${expertIndexAddress}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    const pubKey = await deployShareToken(provider, wallet, expertIndexAddress, tokenName, tokenSymbol);

    console.log('\n=== Deployment Complete ===');
    console.log(`  IndexShareToken: ${pubKey}`);
    console.log(`  Name:            ${tokenName}`);
    console.log(`  Symbol:          ${tokenSymbol}`);
    console.log(`  Decimals:        8`);
    console.log(`  Minter:          ${expertIndexAddress}`);
}

if (isMainModule) {
    main().catch((err: unknown) => {
        console.error('\nDeployment failed:', err);
        process.exit(1);
    });
}
