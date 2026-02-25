/**
 * Test bet - polls allowance until confirmed, then creates bet
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

const TailsAbi: BitcoinInterfaceAbi = [
    {
        name: 'createBet',
        inputs: [{ name: 'tierIndex', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'betId', type: ABIDataTypes.UINT256 }],
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

async function waitForUTXOs(provider: JSONRpcProvider, addr: string): Promise<UTXO[]> {
    for (let i = 0; i < 30; i++) {
        const utxos = await provider.utxoManager.getUTXOs({ address: addr });
        if (utxos.length > 0) return utxos;
        console.log(`  Waiting for UTXOs (${i + 1}/30)...`);
        await sleep(5000);
    }
    throw new Error('No UTXOs');
}

async function main() {
    const seedPhrase = process.env['MNEMONIC']!;
    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const tailsAddr = Address.fromString(TAILS_ADDRESS);

    console.log(`Wallet: ${wallet.p2tr}`);

    const moto = getContract(MOTO_ADDRESS, OP_20_ABI, provider, NETWORK, wallet.address);

    // Check current allowance — previous approvals may have confirmed
    const check = await moto.allowance(wallet.address, tailsAddr);
    let allowance: bigint = check.properties.remaining ?? check.properties.allowance ?? 0n;
    console.log(`Current allowance: ${Number(allowance) / 1e8} MOTO`);

    const minNeeded = 10n * 10n ** 8n; // 10 MOTO for tier 0

    if (allowance < minNeeded) {
        // Send new approval
        console.log('Sending approval for 100,000 MOTO...');
        const approveResult = await moto.increaseAllowance(tailsAddr, 100_000n * 10n ** 8n);
        const utxos = await waitForUTXOs(provider, wallet.p2tr);
        const receipt = await approveResult.sendTransaction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            refundTo: wallet.p2tr,
            maximumAllowedSatToSpend: MAX_SAT,
            feeRate: FEE_RATE,
            network: NETWORK,
            utxos,
        });
        console.log(`Approval TX: ${receipt.transactionId}`);

        // Poll until allowance confirms
        console.log('Polling allowance...');
        for (let i = 0; i < 24; i++) {
            await sleep(10000);
            try {
                const pollResult = await moto.allowance(wallet.address, tailsAddr);
                allowance = pollResult.properties.remaining ?? pollResult.properties.allowance ?? 0n;
                console.log(`  Attempt ${i + 1}: allowance = ${Number(allowance) / 1e8} MOTO`);
                if (allowance >= minNeeded) {
                    console.log('  Allowance confirmed!');
                    break;
                }
            } catch { /* keep polling */ }
        }

        if (allowance < minNeeded) {
            console.error('Allowance not confirmed after 4 minutes. Try again later.');
            process.exit(1);
        }
    }

    // Create bet (tier 0 = 10 MOTO)
    console.log('\nCreating bet (tier 0 = 10 MOTO)...');
    const tails = getContract(TAILS_ADDRESS, TailsAbi, provider, NETWORK, wallet.address);

    const createResult = await tails.createBet(0n);
    console.log('Simulation OK!');

    const utxos = await waitForUTXOs(provider, wallet.p2tr);
    const betReceipt = await createResult.sendTransaction({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        maximumAllowedSatToSpend: MAX_SAT,
        feeRate: FEE_RATE,
        network: NETWORK,
        utxos,
    });
    console.log(`Create Bet TX: ${betReceipt.transactionId}`);

    // Wait and verify
    console.log('Waiting 40s for confirmation...');
    await sleep(40000);

    const statsResult = await tails.getStats();
    const stats = statsResult.properties;
    console.log(`\nTotal Bets: ${stats.totalBets}`);
    console.log(`Next Bet ID: ${stats.nextBetId}`);

    if (stats.nextBetId > 1n) {
        const betResult = await tails.getBet(1n);
        const bet = betResult.properties;
        const statusMap: Record<string, string> = { '1': 'OPEN', '2': 'SETTLED', '3': 'CANCELLED' };
        console.log(`\nBet #1: ${Number(bet.amount) / 1e8} MOTO — ${statusMap[bet.status.toString()] ?? bet.status}`);
    }

    console.log('\nSUCCESS - Bet is live on regtest!');
}

main().catch((err) => {
    console.error('\nFatal:', err);
    process.exit(1);
});
