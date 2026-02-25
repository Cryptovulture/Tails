/**
 * Approval is confirmed on-chain. Skip allowance check, go straight to createBet.
 */
import {
    AddressTypes,
    Mnemonic,
    MLDSASecurityLevel,
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

    console.log(`Wallet: ${wallet.p2tr}`);
    console.log(`Block: ${await provider.getBlockNumber()}`);

    // Also log the full allowance response for debugging
    const moto = getContract(MOTO_ADDRESS, OP_20_ABI, provider, NETWORK, wallet.address);
    try {
        const tailsAddr = (await import('@btc-vision/transaction')).Address.fromString(TAILS_ADDRESS);
        const allowanceResult = await moto.allowance(wallet.address, tailsAddr);
        console.log('Allowance full response:', JSON.stringify(allowanceResult.properties, (_, v) => typeof v === 'bigint' ? v.toString() : v));
    } catch (err) {
        console.log('Allowance check error:', (err as Error).message);
    }

    // Try creating bet directly
    console.log('\nCreating bet (tier 0 = 10 MOTO)...');
    const tails = getContract(TAILS_ADDRESS, TailsAbi, provider, NETWORK, wallet.address);

    try {
        const createResult = await tails.createBet(0n);
        console.log('Simulation OK! Sending TX...');

        const utxos = await waitForUTXOs(provider, wallet.p2tr);
        const receipt = await createResult.sendTransaction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            refundTo: wallet.p2tr,
            maximumAllowedSatToSpend: MAX_SAT,
            feeRate: FEE_RATE,
            network: NETWORK,
            utxos,
        });
        console.log(`Create Bet TX: ${receipt.transactionId}`);

        console.log('Waiting 45s for confirmation...');
        await sleep(45000);

        const statsResult = await tails.getStats();
        const stats = statsResult.properties;
        console.log(`\nTotal Bets: ${stats.totalBets}`);
        console.log(`Next Bet ID: ${stats.nextBetId}`);

        if (stats.nextBetId > 1n) {
            for (let i = 1n; i < stats.nextBetId; i++) {
                const betResult = await tails.getBet(i);
                const bet = betResult.properties;
                const statusMap: Record<string, string> = { '1': 'OPEN', '2': 'SETTLED', '3': 'CANCELLED' };
                console.log(`Bet #${i}: ${Number(bet.amount) / 1e8} MOTO — ${statusMap[bet.status.toString()] ?? bet.status}`);
            }
        }

        console.log('\nSUCCESS!');
    } catch (err) {
        console.error('Create bet error:', (err as Error).message);

        // If still "Insufficient allowance", the issue is the approval hasn't propagated
        // Try checking raw OP20 state
        if ((err as Error).message.includes('Insufficient allowance')) {
            console.log('\nApproval not visible to simulation yet. Checking MOTO balance...');
            try {
                const balResult = await moto.balanceOf(wallet.address);
                console.log(`MOTO balance: ${Number(balResult.properties.balance ?? 0n) / 1e8}`);
            } catch (e) {
                console.log('Balance check error:', (e as Error).message);
            }
        }
    }
}

main().catch((err) => {
    console.error('\nFatal:', err);
    process.exit(1);
});
