/**
 * Test: Create bet using tier index (matching deployed contract).
 * The deployed contract uses tier 0=10MOTO, 1=25MOTO, etc.
 */
import {
    AddressTypes,
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
    OP_20_ABI,
} from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const NETWORK = networks.regtest;
const RPC_URL = 'https://regtest.opnet.org';
const FEE_RATE = 5;
const MAX_SAT = 100_000n;

const MOTO_ADDRESS = '0x0a6732489a31e6de07917a28ff7df311fc5f98f6e1664943ac1c3fe7893bdab5';
const TAILS_ADDRESS = '0x24d15e679086b3a0575d0028f8a593a14fa74471309ca7159ec5060a5dacb703';

// ABI matching deployed contract: createBet takes tierIndex (UINT256)
const TailsAbi: BitcoinInterfaceAbi = [
    {
        name: 'createBet',
        inputs: [{ name: 'tierIndex', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'betId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'acceptBet',
        inputs: [{ name: 'betId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'winnerHash', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getStats',
        constant: true,
        inputs: [],
        outputs: [
            { name: 'totalBets', type: ABIDataTypes.UINT256 },
            { name: 'totalVolume', type: ABIDataTypes.UINT256 },
            { name: 'totalFees', type: ABIDataTypes.UINT256 },
            { name: 'nextBetId', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getBet',
        constant: true,
        inputs: [{ name: 'betId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'creator', type: ABIDataTypes.UINT256 },
            { name: 'acceptor', type: ABIDataTypes.UINT256 },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'status', type: ABIDataTypes.UINT256 },
            { name: 'winner', type: ABIDataTypes.UINT256 },
            { name: 'blockNumber', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
];

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function waitForUTXOs(provider: JSONRpcProvider, addr: string, label: string): Promise<UTXO[]> {
    for (let i = 0; i < 30; i++) {
        const utxos = await provider.utxoManager.getUTXOs({ address: addr });
        if (utxos.length > 0) return utxos;
        console.log(`  Waiting for UTXOs [${label}] (${i + 1}/30)...`);
        await sleep(5000);
    }
    throw new Error(`No UTXOs for ${label}`);
}

async function main() {
    const seedPhrase = process.env['MNEMONIC'];
    if (!seedPhrase) { console.error('MNEMONIC required'); process.exit(1); }

    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet0 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

    console.log('=== Test Bet (Tier-Based) ===');
    console.log(`Wallet: ${wallet0.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const tailsAddr = Address.fromString(TAILS_ADDRESS);

    // Check current allowance
    const motoContract = getContract(MOTO_ADDRESS, OP_20_ABI, provider, NETWORK, wallet0.address);
    const allowanceResult = await motoContract.allowance(wallet0.address, tailsAddr);
    const currentAllowance: bigint = allowanceResult.properties.remaining ?? allowanceResult.properties.allowance ?? 0n;
    console.log(`Current MOTO allowance: ${Number(currentAllowance) / 1e8}`);

    // Approve more if needed (10 MOTO = tier 0 requires 10*10^8 = 1,000,000,000)
    const minNeeded = 10n * 10n ** 8n;
    if (currentAllowance < minNeeded) {
        console.log('Approving 10,000 MOTO...');
        const approveResult = await motoContract.increaseAllowance(tailsAddr, 10_000n * 10n ** 8n);
        const utxos = await waitForUTXOs(provider, wallet0.p2tr, 'approve');
        const receipt = await approveResult.sendTransaction({
            signer: wallet0.keypair,
            mldsaSigner: wallet0.mldsaKeypair,
            refundTo: wallet0.p2tr,
            maximumAllowedSatToSpend: MAX_SAT,
            feeRate: FEE_RATE,
            network: NETWORK,
            utxos,
        });
        console.log(`Approval TX: ${receipt.transactionId}`);
        console.log('Waiting 35s for confirmation...');
        await sleep(35000);
    }

    // Create bet with tier index 0 (= 10 MOTO)
    console.log('\nCreating bet with tier index 0 (10 MOTO)...');
    const tails = getContract(TAILS_ADDRESS, TailsAbi, provider, NETWORK, wallet0.address);

    const createResult = await tails.createBet(0n);
    console.log('Simulation OK! Sending TX...');
    const utxos = await waitForUTXOs(provider, wallet0.p2tr, 'createBet');
    const receipt = await createResult.sendTransaction({
        signer: wallet0.keypair,
        mldsaSigner: wallet0.mldsaKeypair,
        refundTo: wallet0.p2tr,
        maximumAllowedSatToSpend: MAX_SAT,
        feeRate: FEE_RATE,
        network: NETWORK,
        utxos,
    });
    console.log(`Create Bet TX: ${receipt.transactionId}`);
    console.log('Waiting 35s for confirmation...');
    await sleep(35000);

    // Verify
    console.log('\nVerifying...');
    const statsResult = await tails.getStats();
    const stats = statsResult.properties;
    console.log(`Total Bets: ${stats.totalBets}`);
    console.log(`Next Bet ID: ${stats.nextBetId}`);

    if (stats.nextBetId > 1n) {
        const betResult = await tails.getBet(1n);
        const bet = betResult.properties;
        const statusMap: Record<string, string> = { '1': 'OPEN', '2': 'SETTLED', '3': 'CANCELLED' };
        console.log(`\nBet #1:`);
        console.log(`  Amount: ${Number(bet.amount) / 1e8} MOTO`);
        console.log(`  Status: ${statusMap[bet.status.toString()] ?? bet.status}`);
    }

    console.log('\nDone!');
}

main().catch((err) => {
    console.error('\nFatal:', err);
    process.exit(1);
});
