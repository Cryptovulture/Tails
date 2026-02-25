/**
 * Create pre-built MotoBasket indexes on regtest.
 *
 * Flow:
 *   1. Deploy an IndexShareToken per index (minter = ExpertIndex)
 *   2. Approve BASKET for creator locks
 *   3. Call createBasket on ExpertIndex with share token + components
 *
 * Selector for createBasket: 0x704A0E05 (extracted from ExpertIndex.wat)
 * The new createBasket calldata format:
 *   shareToken (Address), nameLen (u256), nameBytes (u256[]),
 *   perfFeeBps (u256), compCount (u256), components (Address, u256)[]
 *
 * Environment variables:
 *   MNEMONIC - 12/24-word seed phrase for a funded regtest wallet with BASKET
 *
 * Usage:
 *   MNEMONIC="..." npm run create-indexes
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
    AddressTypes,
    BinaryWriter,
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
import { deployShareToken } from './deploy-share-token.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NETWORK: Network = networks.regtest;
const RPC_URL = 'https://regtest.opnet.org';
const FEE_RATE = 5;
const MAX_SAT_TO_SPEND = 100_000n;
const RETRY_INTERVAL_MS = 10_000;
const RETRY_MAX_ATTEMPTS = 60;
const WAIT_BETWEEN_TX_MS = 60_000;

const ADDRESSES_PATH = path.resolve(__dirname, 'deployed-addresses.json');

// ============================================================================
// REGTEST TOKEN ADDRESSES
// ============================================================================

const FLIP_ADDRESS = '0xca35f4d13132382ac154264b81fc594aa7f6e08b7e0c9484648344544051105b';
const ODYS_ADDRESS = '0xc573930e4c67f47246589ce6fa2dbd1b91b58c8fdd7ace336ce79e65120f79eb';
const PILL_ADDRESS = '0xfb7df2f08d8042d4df0506c0d4cee3cfa5f2d7b02ef01ec76dd699551393a438';

// ============================================================================
// INDEX DEFINITIONS
// ============================================================================

interface IndexComponent {
    token: string;
    symbol: string;
    weight: number; // bps (5000 = 50%)
}

interface IndexConfig {
    name: string;
    shareSymbol: string; // OP20 share token symbol
    perfFeeBps: number;
    components: IndexComponent[];
}

const INDEXES: IndexConfig[] = [
    {
        name: 'FLIP-ODYS 50/50',
        shareSymbol: 'sFO50',
        perfFeeBps: 1000,
        components: [
            { token: FLIP_ADDRESS, symbol: 'FLIP', weight: 5000 },
            { token: ODYS_ADDRESS, symbol: 'ODYS', weight: 5000 },
        ],
    },
    {
        name: 'PILL-FLIP-ODYS 40/30/30',
        shareSymbol: 'sPFO',
        perfFeeBps: 1500,
        components: [
            { token: PILL_ADDRESS, symbol: 'PILL', weight: 4000 },
            { token: FLIP_ADDRESS, symbol: 'FLIP', weight: 3000 },
            { token: ODYS_ADDRESS, symbol: 'ODYS', weight: 3000 },
        ],
    },
    {
        name: 'ODYS-PILL 50/50',
        shareSymbol: 'sOP50',
        perfFeeBps: 500,
        components: [
            { token: ODYS_ADDRESS, symbol: 'ODYS', weight: 5000 },
            { token: PILL_ADDRESS, symbol: 'PILL', weight: 5000 },
        ],
    },
];

// ============================================================================
// ABIs & SELECTORS
// ============================================================================

const INCREASE_ALLOWANCE_ABI: BitcoinInterfaceAbi = [
    {
        name: 'increaseAllowance',
        inputs: [
            { name: 'spender', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
];

/**
 * Hardcoded selector for createBasket extracted from compiled ExpertIndex.wat.
 * New signature with shareToken as first param: 1883901445 = 0x704A0E05
 */
const CREATE_BASKET_SELECTOR = 0x704A0E05;

/** Minimal ABI used only to get contract properties (.address, .from, .p2op, etc.) */
const EXPERT_INDEX_ABI: BitcoinInterfaceAbi = [
    {
        name: 'createBasket',
        inputs: [{ name: 'shareToken', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'basketId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
];

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUTXOs(
    provider: JSONRpcProvider,
    walletAddress: string,
): Promise<UTXO[]> {
    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
        const utxos = await provider.utxoManager.getUTXOs({
            address: walletAddress,
        });
        if (utxos.length > 0) return utxos;
        console.log(`  Waiting for UTXOs (${attempt.toString()}/${RETRY_MAX_ATTEMPTS.toString()})...`);
        await sleep(5_000);
    }
    throw new Error('No UTXOs available');
}

function estimateGas(gas: bigint, gasPerSat: bigint): bigint {
    const exactGas = (gas * gasPerSat) / 1000000000000n;
    const finalGas = (exactGas * 100n) / (100n - 30n);
    return finalGas > 297n ? finalGas : 297n;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
    console.log('=== Create MotoBasket Indexes on Regtest ===\n');

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

    const basketTokenAddress = addresses.basketToken as string;
    if (!basketTokenAddress) {
        console.error('ERROR: basketToken not found in deployed-addresses.json');
        process.exit(1);
    }

    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet: Wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

    console.log(`Deployer:      ${wallet.p2tr}`);
    console.log(`ExpertIndex:   ${expertIndexAddress}`);
    console.log(`BASKET Token:  ${basketTokenAddress}`);
    console.log(`Tokens:        FLIP, ODYS, PILL`);
    console.log(`Indexes:       ${INDEXES.length.toString()}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // ----------------------------------------------------------------
    // Step 1: Deploy IndexShareToken for each index
    // ----------------------------------------------------------------
    const shareTokenAddresses: string[] = [];

    for (let idx = 0; idx < INDEXES.length; idx++) {
        const index = INDEXES[idx];
        const shareName = `${index.name} Shares`;

        const pubKey = await deployShareToken(
            provider,
            wallet,
            expertIndexAddress,
            shareName,
            index.shareSymbol,
        );

        shareTokenAddresses.push(pubKey);

        if (idx < INDEXES.length - 1) {
            console.log('  Waiting for UTXO confirmation before next share token...');
            await sleep(WAIT_BETWEEN_TX_MS);
        }
    }

    console.log('\n--- Share Tokens Deployed ---');
    for (let i = 0; i < INDEXES.length; i++) {
        console.log(`  ${INDEXES[i].shareSymbol}: ${shareTokenAddresses[i]}`);
    }

    console.log('\n  Waiting for all share token deployments to confirm...');
    await sleep(WAIT_BETWEEN_TX_MS);

    // ----------------------------------------------------------------
    // Step 2: Approve ExpertIndex to spend BASKET (3 x 1,000 lock)
    // ----------------------------------------------------------------
    const totalLock = 3000n * 100_000_000n;
    console.log(`\n--- Approving ${(totalLock / 100_000_000n).toString()} BASKET for creator locks ---`);

    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
        try {
            const basketContract = getContract(
                basketTokenAddress,
                INCREASE_ALLOWANCE_ABI,
                provider,
                NETWORK,
                wallet.address,
            );

            const expertAddr = Address.fromString(expertIndexAddress);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const allowanceMethod = (basketContract as any)['increaseAllowance'];
            if (!allowanceMethod) throw new Error('increaseAllowance method not found');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const simulation = await allowanceMethod.call(basketContract, expertAddr, totalLock);

            const utxos = await waitForUTXOs(provider, wallet.p2tr);
            const receipt = await simulation.sendTransaction({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                refundTo: wallet.p2tr,
                maximumAllowedSatToSpend: MAX_SAT_TO_SPEND,
                feeRate: FEE_RATE,
                network: NETWORK,
                utxos: utxos,
            });

            console.log(`  Approve TX: ${String(receipt.transactionId ?? 'ok')}`);
            break;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('Invalid contract') && attempt < RETRY_MAX_ATTEMPTS) {
                console.log(`  Waiting for BASKET contract... (${attempt.toString()})`);
                await sleep(RETRY_INTERVAL_MS);
                continue;
            }
            throw err;
        }
    }

    console.log('  Waiting for approval confirmation...');
    await sleep(WAIT_BETWEEN_TX_MS);

    // ----------------------------------------------------------------
    // Step 3: Create each index with share token address in calldata
    // ----------------------------------------------------------------
    for (let idx = 0; idx < INDEXES.length; idx++) {
        const index = INDEXES[idx];
        const shareTokenAddr = shareTokenAddresses[idx];

        console.log(`\n--- Creating Index ${(idx + 1).toString()}/${INDEXES.length.toString()}: "${index.name}" ---`);
        console.log(`  Share token: ${shareTokenAddr}`);
        console.log(`  Perf fee: ${(index.perfFeeBps / 100).toString()}%`);
        for (const comp of index.components) {
            console.log(`    ${comp.symbol}: ${(comp.weight / 100).toString()}%`);
        }

        for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
            try {
                const contract = getContract(
                    expertIndexAddress,
                    EXPERT_INDEX_ABI,
                    provider,
                    NETWORK,
                    wallet.address,
                );

                // Build calldata: selector + shareToken + nameLen + nameBytes + perfFeeBps + compCount + components
                const nameBytes = new TextEncoder().encode(index.name);
                const writer = new BinaryWriter();
                writer.writeSelector(CREATE_BASKET_SELECTOR);
                writer.writeAddress(Address.fromString(shareTokenAddr)); // NEW: share token address
                writer.writeU256(BigInt(nameBytes.length));
                for (let i = 0; i < nameBytes.length; i++) {
                    writer.writeU256(BigInt(nameBytes[i]));
                }
                writer.writeU256(BigInt(index.perfFeeBps));
                writer.writeU256(BigInt(index.components.length));
                for (const comp of index.components) {
                    const addr = Address.fromString(comp.token);
                    writer.writeAddress(addr);
                    writer.writeU256(BigInt(comp.weight));
                }
                const fullCalldata = Buffer.from(writer.getBuffer());

                // Simulate via provider.call
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const response = await provider.call(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (contract as any).address,
                    fullCalldata,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (contract as any).from,
                );

                if ('error' in response) {
                    throw new Error(`createBasket simulation failed: ${(response as { error: string }).error}`);
                }

                // Configure the response for sending
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const contractAddr = await (contract as any).contractAddress;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                response.setTo((contract as any).p2op, contractAddr);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                response.setFromAddress((contract as any).from);
                response.setCalldata(fullCalldata);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const gasParameters = await (contract as any).currentGasParameters();
                const gas = estimateGas(response.estimatedGas || 0n, gasParameters.gasPerSat);
                const gasRefunded = estimateGas(response.refundedGas || 0n, gasParameters.gasPerSat);
                response.setBitcoinFee(gasParameters.bitcoin);
                response.setGasEstimation(gas, gasRefunded);

                // Send transaction
                const utxos = await waitForUTXOs(provider, wallet.p2tr);
                const receipt = await response.sendTransaction({
                    signer: wallet.keypair,
                    mldsaSigner: wallet.mldsaKeypair,
                    refundTo: wallet.p2tr,
                    maximumAllowedSatToSpend: MAX_SAT_TO_SPEND,
                    feeRate: FEE_RATE,
                    network: NETWORK,
                    utxos: utxos,
                });

                console.log(`  TX: ${String(receipt.transactionId ?? 'ok')}`);
                break;
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                if ((msg.includes('Invalid contract') || msg.includes('Insufficient allowance') || msg.includes('Share token zero')) && attempt < RETRY_MAX_ATTEMPTS) {
                    console.log(`  Waiting for contract/allowance/share token... (${attempt.toString()}) - ${msg.slice(0, 80)}`);
                    await sleep(RETRY_INTERVAL_MS);
                    continue;
                }
                throw err;
            }
        }

        if (idx < INDEXES.length - 1) {
            console.log('  Waiting for UTXO confirmation...');
            await sleep(WAIT_BETWEEN_TX_MS);
        }
    }

    // ----------------------------------------------------------------
    // Summary
    // ----------------------------------------------------------------
    console.log('\n=== All Indexes Created ===');
    for (let i = 0; i < INDEXES.length; i++) {
        const idx = INDEXES[i];
        const comps = idx.components.map((c) => `${c.symbol} ${(c.weight / 100).toString()}%`).join(', ');
        console.log(`  ${(i + 1).toString()}. "${idx.name}" (${idx.shareSymbol}) — ${comps} (${(idx.perfFeeBps / 100).toString()}% perf fee)`);
        console.log(`     Share token: ${shareTokenAddresses[i]}`);
    }
    console.log('\nIndexes should now appear in the MotoBasket frontend.');
}

main().catch((err: unknown) => {
    console.error('\nFailed:', err);
    process.exit(1);
});
