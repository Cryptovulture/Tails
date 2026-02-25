import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';

export const TailsEvents = [
    {
        name: 'BetCreated',
        values: [
            { name: 'betId', type: ABIDataTypes.UINT256 },
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'BetSettled',
        values: [
            { name: 'betId', type: ABIDataTypes.UINT256 },
            { name: 'winner', type: ABIDataTypes.ADDRESS },
            { name: 'loser', type: ABIDataTypes.ADDRESS },
            { name: 'payout', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'BetCancelled',
        values: [
            { name: 'betId', type: ABIDataTypes.UINT256 },
            { name: 'creator', type: ABIDataTypes.ADDRESS },
        ],
        type: BitcoinAbiTypes.Event,
    },
];

export const TailsAbi: BitcoinInterfaceAbi = [
    {
        name: 'createBet',
        inputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
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
        name: 'cancelBet',
        inputs: [{ name: 'betId', type: ABIDataTypes.UINT256 }],
        outputs: [],
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
        name: 'getUserStats',
        constant: true,
        inputs: [{ name: 'user', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'totalBets', type: ABIDataTypes.UINT256 },
            { name: 'totalWins', type: ABIDataTypes.UINT256 },
            { name: 'totalVolume', type: ABIDataTypes.UINT256 },
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
    ...TailsEvents,
    ...OP_NET_ABI,
] as BitcoinInterfaceAbi;

export default TailsAbi;
