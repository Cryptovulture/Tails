import { ABIDataTypes, BitcoinAbiTypes, OP_20_ABI } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';

export const FLIPTokenAbi: BitcoinInterfaceAbi = [
    ...OP_20_ABI,
    {
        name: 'mint',
        inputs: [
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'Minted',
        values: [
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
] as BitcoinInterfaceAbi;

export default FLIPTokenAbi;
