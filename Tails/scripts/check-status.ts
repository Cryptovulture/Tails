/**
 * Quick diagnostic: wallet balance, contract state, configuration check
 */
import {
    AddressTypes,
    Mnemonic,
    MLDSASecurityLevel,
    Address,
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

const MOTO_ADDRESS = '0x0a6732489a31e6de07917a28ff7df311fc5f98f6e1664943ac1c3fe7893bdab5';
const TAILS_ADDRESS = '0x24d15e679086b3a0575d0028f8a593a14fa74471309ca7159ec5060a5dacb703';
const FLIP_TOKEN_ADDRESS = '0xbc38e543465df652002e4d8204d686865cc09d880569f37676df36d272aa9bee';
const STAKING_ADDRESS = '0xadbd5dc642fe0c391b19c9d8fc7779a9b542a2669963e76fc2c3d4efd7ad4bd3';

const TailsAbi: BitcoinInterfaceAbi = [
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
        name: 'getFeeStats',
        constant: true,
        inputs: [],
        outputs: [
            { name: 'stakerFees', type: ABIDataTypes.UINT256 },
            { name: 'buybackFees', type: ABIDataTypes.UINT256 },
            { name: 'treasuryFees', type: ABIDataTypes.UINT256 },
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

async function main() {
    const seedPhrase = process.env['MNEMONIC'];
    if (!seedPhrase) {
        console.error('MNEMONIC env var required');
        process.exit(1);
    }

    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

    console.log('=== Wallet ===');
    console.log(`  P2TR address: ${wallet.p2tr}`);
    console.log(`  Address obj:  ${wallet.address.toHex()}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Check UTXOs
    try {
        const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
        const totalSats = utxos.reduce((sum, u) => sum + BigInt(u.value), 0n);
        console.log(`  UTXOs: ${utxos.length} (${totalSats} sats)`);
    } catch (err) {
        console.log(`  UTXOs: error - ${(err as Error).message}`);
    }

    // Check MOTO balance
    try {
        const motoContract = getContract(
            MOTO_ADDRESS,
            OP_20_ABI,
            provider,
            NETWORK,
            wallet.address,
        );
        const balResult = await motoContract.balanceOf(wallet.address);
        const bal: bigint = balResult.properties.balance ?? 0n;
        console.log(`  MOTO balance: ${(Number(bal) / 1e8).toFixed(2)} MOTO`);
    } catch (err) {
        console.log(`  MOTO balance: error - ${(err as Error).message}`);
    }

    // Check Tails contract
    console.log('\n=== Tails Contract ===');
    console.log(`  Address: ${TAILS_ADDRESS}`);

    try {
        const tails = getContract(
            TAILS_ADDRESS,
            TailsAbi,
            provider,
            NETWORK,
            wallet.address,
        );

        const statsResult = await tails.getStats();
        const stats = statsResult.properties;
        console.log(`  Total Bets:   ${stats.totalBets}`);
        console.log(`  Total Volume: ${(Number(stats.totalVolume) / 1e8).toFixed(2)} MOTO`);
        console.log(`  Total Fees:   ${(Number(stats.totalFees) / 1e8).toFixed(2)} MOTO`);
        console.log(`  Next Bet ID:  ${stats.nextBetId}`);

        // Check fee stats
        const feeResult = await tails.getFeeStats();
        const fees = feeResult.properties;
        console.log(`  Staker Fees:  ${(Number(fees.stakerFees) / 1e8).toFixed(2)} MOTO`);
        console.log(`  Buyback Fees: ${(Number(fees.buybackFees) / 1e8).toFixed(2)} MOTO`);
        console.log(`  Treasury Fees:${(Number(fees.treasuryFees) / 1e8).toFixed(2)} MOTO`);

        // Check for open bets
        const nextId = stats.nextBetId as bigint;
        if (nextId > 1n) {
            console.log('\n=== Recent Bets ===');
            const start = nextId - 1n;
            const limit = start < 5n ? start : 5n;
            for (let i = start; i > start - limit; i--) {
                try {
                    const betResult = await tails.getBet(i);
                    const bet = betResult.properties;
                    const statusMap: Record<string, string> = { '1': 'OPEN', '2': 'SETTLED', '3': 'CANCELLED' };
                    console.log(`  Bet #${i}: ${(Number(bet.amount) / 1e8).toFixed(0)} MOTO - ${statusMap[bet.status.toString()] ?? 'UNKNOWN'}`);
                } catch {
                    console.log(`  Bet #${i}: error reading`);
                }
            }
        }
    } catch (err) {
        console.log(`  ERROR: ${(err as Error).message}`);
        console.log(`  (Contract may not be deployed or configured correctly)`);
    }

    // Check other contracts exist
    console.log('\n=== Other Contracts ===');
    for (const [name, addr] of [['FLIP Token', FLIP_TOKEN_ADDRESS], ['FLIP Staking', STAKING_ADDRESS]]) {
        try {
            const contract = getContract(addr, OP_20_ABI, provider, NETWORK, wallet.address);
            const result = await contract.balanceOf(wallet.address);
            console.log(`  ${name}: OK (balance query succeeded)`);
        } catch (err) {
            console.log(`  ${name}: ${(err as Error).message}`);
        }
    }

    console.log('\n=== Block Info ===');
    try {
        const blockNum = await provider.getBlockNumber();
        console.log(`  Current block: ${blockNum}`);
    } catch (err) {
        console.log(`  Block: error - ${(err as Error).message}`);
    }

    console.log('\nDone.');
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
