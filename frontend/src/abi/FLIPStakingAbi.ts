import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';

export const FLIPStakingEvents = [
    {
        name: 'Staked',
        values: [
            { name: 'user', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'Unstaked',
        values: [
            { name: 'user', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'RewardClaimed',
        values: [
            { name: 'user', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'RewardsAdded',
        values: [
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'newRewardPerToken', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
];

export const FLIPStakingAbi: BitcoinInterfaceAbi = [
    {
        name: 'stake',
        inputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'unstake',
        inputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claimRewards',
        inputs: [],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getStakeInfo',
        constant: true,
        inputs: [{ name: 'user', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'stakedBalance', type: ABIDataTypes.UINT256 },
            { name: 'pendingRewards', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPoolStats',
        constant: true,
        inputs: [],
        outputs: [
            { name: 'totalStaked', type: ABIDataTypes.UINT256 },
            { name: 'rewardPerToken', type: ABIDataTypes.UINT256 },
            { name: 'totalDistributed', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    ...FLIPStakingEvents,
    ...OP_NET_ABI,
] as BitcoinInterfaceAbi;

export default FLIPStakingAbi;
