/**
 * Set the real MotoSwap router address on ExpertIndex and BatchRouter.
 *
 * Reads deployed addresses from deployed-addresses.json and:
 *   - ExpertIndex: calls proposeRouter() then waits 144 blocks then executeRouterProposal()
 *   - BatchRouter: calls setRouter() (immediate)
 *
 * Environment variables:
 *   MNEMONIC - 12/24-word seed phrase for the deployer wallet
 *
 * Usage:
 *   MNEMONIC="..." npm run set-router
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
const BLOCK_POLL_INTERVAL_MS = 15_000;
const BLOCK_POLL_MAX_ATTEMPTS = 200;

const MOTOSWAP_ROUTER_ADDRESS = '0x80f8375d061d638a0b45a4eb4decbfd39e9abba913f464787194ce3c02d2ea5a';

const ADDRESSES_PATH = path.resolve(__dirname, 'deployed-addresses.json');

interface DeployedAddresses {
    motoToken: string;
    flipToken: string;
    tails: string;
    flipStaking: string;
    deployer: string;
    expertIndex?: string;
    batchRouter?: string;
}

// BatchRouter still uses immediate setRouter
const SET_ROUTER_ABI: BitcoinInterfaceAbi = [
    {
        name: 'setRouter',
        inputs: [{ name: 'newRouter', type: ABIDataTypes.ADDRESS }],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
];

// ExpertIndex uses timelocked proposeRouter + executeRouterProposal
const PROPOSE_ROUTER_ABI: BitcoinInterfaceAbi = [
    {
        name: 'proposeRouter',
        inputs: [{ name: 'newRouter', type: ABIDataTypes.ADDRESS }],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'executeRouterProposal',
        inputs: [],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
];

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callSetRouter(
    provider: JSONRpcProvider,
    wallet: Wallet,
    contractPubKey: string,
    routerAddress: Address,
    label: string,
): Promise<void> {
    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
        try {
            console.log(`  Calling setRouter on ${label} (attempt ${attempt.toString()})...`);

            const contract = getContract(
                contractPubKey,
                SET_ROUTER_ABI,
                provider,
                NETWORK,
                wallet.address,
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const method = (contract as any)['setRouter'];
            if (!method) {
                throw new Error('setRouter method not found on contract');
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const simulation = await method.call(contract, routerAddress);

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

            console.log(`  ${label} setRouter TX: ${String(receipt.transactionId ?? 'ok')}`);
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

async function callProposeRouter(
    provider: JSONRpcProvider,
    wallet: Wallet,
    contractPubKey: string,
    routerAddress: Address,
    label: string,
): Promise<void> {
    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
        try {
            console.log(`  Calling proposeRouter on ${label} (attempt ${attempt.toString()})...`);

            const contract = getContract(
                contractPubKey,
                PROPOSE_ROUTER_ABI,
                provider,
                NETWORK,
                wallet.address,
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const method = (contract as any)['proposeRouter'];
            if (!method) {
                throw new Error('proposeRouter method not found on contract');
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const simulation = await method.call(contract, routerAddress);

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

            console.log(`  ${label} proposeRouter TX: ${String(receipt.transactionId ?? 'ok')}`);
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

async function waitForBlocks(
    provider: JSONRpcProvider,
    targetBlock: bigint,
    label: string,
): Promise<void> {
    console.log(`  Waiting for block ${targetBlock.toString()} to execute ${label} router proposal...`);

    for (let attempt = 1; attempt <= BLOCK_POLL_MAX_ATTEMPTS; attempt++) {
        try {
            const blockNumber = await provider.getBlockNumber();
            if (blockNumber >= targetBlock) {
                console.log(`  Block ${blockNumber.toString()} reached (target: ${targetBlock.toString()})`);
                return;
            }
            const remaining = targetBlock - blockNumber;
            console.log(`  Block ${blockNumber.toString()} / ${targetBlock.toString()} (${remaining.toString()} blocks remaining)...`);
        } catch {
            console.log(`  Failed to get block number, retrying...`);
        }
        await sleep(BLOCK_POLL_INTERVAL_MS);
    }

    throw new Error(`Timed out waiting for block ${targetBlock.toString()}`);
}

async function callExecuteRouterProposal(
    provider: JSONRpcProvider,
    wallet: Wallet,
    contractPubKey: string,
    label: string,
): Promise<void> {
    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
        try {
            console.log(`  Calling executeRouterProposal on ${label} (attempt ${attempt.toString()})...`);

            const contract = getContract(
                contractPubKey,
                PROPOSE_ROUTER_ABI,
                provider,
                NETWORK,
                wallet.address,
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const method = (contract as any)['executeRouterProposal'];
            if (!method) {
                throw new Error('executeRouterProposal method not found on contract');
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const simulation = await method.call(contract);

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

            console.log(`  ${label} executeRouterProposal TX: ${String(receipt.transactionId ?? 'ok')}`);
            return;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (
                (msg.includes('Delay not met') || msg.includes('Invalid contract')) &&
                attempt < RETRY_MAX_ATTEMPTS
            ) {
                console.log(`  Not ready yet, retrying in ${(RETRY_INTERVAL_MS / 1000).toString()}s...`);
                await sleep(RETRY_INTERVAL_MS);
                continue;
            }
            throw err;
        }
    }
}

async function main(): Promise<void> {
    console.log('=== Set MotoSwap Router on ExpertIndex & BatchRouter ===\n');

    const seedPhrase = process.env['MNEMONIC'];
    if (!seedPhrase) {
        console.error('ERROR: Missing MNEMONIC environment variable');
        process.exit(1);
    }

    if (!fs.existsSync(ADDRESSES_PATH)) {
        console.error('ERROR: deployed-addresses.json not found. Deploy contracts first.');
        process.exit(1);
    }

    const addresses: DeployedAddresses = JSON.parse(
        fs.readFileSync(ADDRESSES_PATH, 'utf-8'),
    ) as DeployedAddresses;

    if (!addresses.expertIndex) {
        console.error('ERROR: expertIndex address not found in deployed-addresses.json');
        process.exit(1);
    }

    if (!addresses.batchRouter) {
        console.error('ERROR: batchRouter address not found in deployed-addresses.json');
        process.exit(1);
    }

    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet: Wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`Deployer: ${wallet.p2tr}`);
    console.log(`MotoSwap Router: ${MOTOSWAP_ROUTER_ADDRESS}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const routerAddress = Address.fromString(MOTOSWAP_ROUTER_ADDRESS);

    // Step 1: Set router on BatchRouter (immediate, no timelock)
    console.log('\n--- BatchRouter (immediate setRouter) ---');
    console.log(`  Contract: ${addresses.batchRouter}`);
    await callSetRouter(provider, wallet, addresses.batchRouter, routerAddress, 'BatchRouter');

    // Step 2: Propose router on ExpertIndex (timelocked, 144-block delay)
    console.log('\n--- ExpertIndex (proposeRouter - 144-block timelock) ---');
    console.log(`  Contract: ${addresses.expertIndex}`);
    await callProposeRouter(provider, wallet, addresses.expertIndex, routerAddress, 'ExpertIndex');

    // Step 3: Wait for 144 blocks then execute
    const currentBlock = await provider.getBlockNumber();
    const targetBlock = currentBlock + 144n;
    console.log(`\n  Proposal submitted at block ${currentBlock.toString()}`);
    console.log(`  Execution available at block ${targetBlock.toString()} (144 blocks)`);
    console.log(`  Waiting for timelock to expire...`);

    await waitForBlocks(provider, targetBlock, 'ExpertIndex');

    // Step 4: Execute the router proposal
    console.log('\n--- ExpertIndex (executeRouterProposal) ---');
    await callExecuteRouterProposal(provider, wallet, addresses.expertIndex, 'ExpertIndex');

    console.log('\n=== Done ===');
    console.log(`  BatchRouter: setRouter complete`);
    console.log(`  ExpertIndex: proposeRouter + executeRouterProposal complete`);
    console.log(`  MotoSwap Router set on both contracts: ${MOTOSWAP_ROUTER_ADDRESS}`);
}

main().catch((err: unknown) => {
    console.error('\nFailed:', err);
    process.exit(1);
});
