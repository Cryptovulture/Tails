export const BET_STATUS = {
    OPEN: 1n,
    SETTLED: 2n,
    CANCELLED: 3n,
} as const;

export const BET_STATUS_LABELS: Record<string, string> = {
    '1': 'Open',
    '2': 'Settled',
    '3': 'Cancelled',
};

export const HOUSE_EDGE_BPS = 300n;
export const BPS_DENOMINATOR = 10_000n;

export const POLL_INTERVAL = 15_000;

export const LOCK_STATE = {
    LOCKED: 0n,
    UNLOCKED: 1n,
    RETURNED: 2n,
} as const;

export const LOCK_STATE_LABELS: Record<string, string> = {
    '0': 'Locked',
    '1': 'Unlocked',
    '2': 'Returned',
};
