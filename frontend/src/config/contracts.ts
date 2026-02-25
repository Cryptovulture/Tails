import { networks } from '@btc-vision/bitcoin';
import type { Network } from '@btc-vision/bitcoin';

export const TAILS_ADDRESS = '0x24d15e679086b3a0575d0028f8a593a14fa74471309ca7159ec5060a5dacb703';
export const FLIP_TOKEN_ADDRESS = '0xbc38e543465df652002e4d8204d686865cc09d880569f37676df36d272aa9bee';
export const STAKING_ADDRESS = '0xadbd5dc642fe0c391b19c9d8fc7779a9b542a2669963e76fc2c3d4efd7ad4bd3';
export const MOTO_TOKEN_ADDRESS = '0x0a6732489a31e6de07917a28ff7df311fc5f98f6e1664943ac1c3fe7893bdab5';

export const NETWORK: Network = networks.regtest;
export const RPC_URL = 'https://regtest.opnet.org';
export const EXPLORER_URL = 'https://mempool.opnet.org';

export const MOTO_DECIMALS = 8;
export const FLIP_DECIMALS = 18;

export const BET_TIERS: readonly { index: number; label: string; moto: number }[] = [
    { index: 0, label: '10', moto: 10 },
    { index: 1, label: '25', moto: 25 },
    { index: 2, label: '50', moto: 50 },
    { index: 3, label: '100', moto: 100 },
    { index: 4, label: '250', moto: 250 },
    { index: 5, label: '500', moto: 500 },
    { index: 6, label: '1K', moto: 1_000 },
    { index: 7, label: '2.5K', moto: 2_500 },
    { index: 8, label: '5K', moto: 5_000 },
    { index: 9, label: '10K', moto: 10_000 },
    { index: 10, label: '25K', moto: 25_000 },
    { index: 11, label: '50K', moto: 50_000 },
    { index: 12, label: '100K', moto: 100_000 },
] as const;
