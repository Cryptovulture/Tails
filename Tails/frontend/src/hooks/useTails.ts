import { useState, useCallback, useRef } from 'react';
import { useContract } from './useContract';
import { useWallet } from '../context/WalletContext';
import { useOPNet } from '../context/OPNetContext';
import { useTxHistory } from '../context/TxHistoryContext';
import { usePolling } from './usePolling';
import { OP_20_ABI } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { TailsAbi } from '../abi/TailsAbi';
import {
    TAILS_ADDRESS, MOTO_TOKEN_ADDRESS, MOTO_DECIMALS, BET_TIERS,
} from '../config/contracts';
import { BET_STATUS, POLL_INTERVAL } from '../utils/constants';
import { formatMoto } from '../utils/format';

export interface BetData {
    betId: bigint;
    creator: bigint;
    acceptor: bigint;
    amount: bigint;
    status: bigint;
    winner: bigint;
    blockNumber: bigint;
}

export interface GlobalStats {
    totalBets: bigint;
    totalVolume: bigint;
    totalFees: bigint;
    nextBetId: bigint;
}

export interface UserStats {
    totalBets: bigint;
    totalWins: bigint;
    totalVolume: bigint;
}

export interface FeeStats {
    stakerFees: bigint;
    buybackFees: bigint;
    treasuryFees: bigint;
}

/** Result from ensureAllowance — carries chained UTXOs when an approval TX was sent. */
interface AllowanceResult {
    ok: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainedUtxos?: any[];
}

const DECIMALS_MULTIPLIER = 10n ** BigInt(MOTO_DECIMALS);

// Max approval: u256 max (~1.15e77) — approve once, never again
const MAX_APPROVAL = (1n << 256n) - 1n;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until a new block is mined (block number advances past `since`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForNextBlock(prov: any, since: bigint, maxWait = 90_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        try {
            const current = await prov.getBlockNumber();
            if (BigInt(current) > since) return;
        } catch { /* keep polling */ }
        await sleep(5_000);
    }
}

export function useTails() {
    const contract = useContract(TAILS_ADDRESS, TailsAbi);
    const motoContract = useContract(MOTO_TOKEN_ADDRESS, OP_20_ABI);
    const { address, p2trAddress, isConnected, signer, mldsaSigner } = useWallet();
    const { network, provider } = useOPNet();
    const { addTx } = useTxHistory();

    const [stats, setStats] = useState<GlobalStats | null>(null);
    const [feeStats, setFeeStats] = useState<FeeStats | null>(null);
    const [userStats, setUserStats] = useState<UserStats | null>(null);
    const [openBets, setOpenBets] = useState<BetData[]>([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [lastTxId, setLastTxId] = useState<string | null>(null);

    const statsRef = useRef<GlobalStats | null>(null);

    const tailsAddress = useRef<unknown>(null);
    if (!tailsAddress.current) {
        try { tailsAddress.current = Address.fromString(TAILS_ADDRESS); } catch { /* */ }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txParams = useCallback((chainedUtxos?: any[]) => ({
        signer,
        mldsaSigner,
        refundTo: p2trAddress!,
        maximumAllowedSatToSpend: 100_000n,
        network,
        ...(chainedUtxos ? { utxos: chainedUtxos } : {}),
    }), [signer, mldsaSigner, p2trAddress, network]);

    /**
     * Ensure the MOTO allowance for the Tails contract is sufficient.
     * Returns { ok, chainedUtxos }. If an approval TX was sent, chainedUtxos
     * contains the newUTXOs to feed into the next TX so both can be mined
     * in the same block without waiting for confirmation.
     */
    const ensureAllowance = useCallback(async (requiredAmount: bigint): Promise<AllowanceResult> => {
        if (!motoContract) { setError('MOTO contract not loaded'); return { ok: false }; }
        if (!tailsAddress.current) { setError('Tails address invalid'); return { ok: false }; }

        console.log('[ensureAllowance] signer:', signer, 'address:', address, 'p2tr:', p2trAddress);

        // Check current allowance — skip approval entirely if already sufficient
        if (address) {
            try {
                const allowanceResult = await motoContract.allowance(
                    address,
                    tailsAddress.current,
                );
                const currentAllowance: bigint = allowanceResult.properties.remaining ?? allowanceResult.properties.allowance ?? 0n;
                console.log('[ensureAllowance] current allowance:', currentAllowance, 'required:', requiredAmount);
                if (currentAllowance >= requiredAmount) return { ok: true };
            } catch (err) {
                console.warn('[ensureAllowance] allowance check failed, will attempt approval anyway:', err);
            }
        } else {
            console.warn('[ensureAllowance] Address object not available. Proceeding to approval.');
        }

        // Always approve unlimited so this only ever happens once per wallet
        setStatus('One-time MOTO approval — confirm in OP_WALLET...');
        try {
            const approveResult = await motoContract.increaseAllowance(
                tailsAddress.current,
                MAX_APPROVAL,
            );
            const approvalReceipt = await approveResult.sendTransaction(txParams());
            const approvalTxId = approvalReceipt?.transactionId ?? approvalReceipt?.txId ?? null;
            if (approvalTxId) {
                console.log('[ensureAllowance] approval TX:', approvalTxId);
                setLastTxId(approvalTxId);
                addTx({ txId: approvalTxId, type: 'approval', label: 'MOTO Approval (Unlimited)', amount: 'Unlimited' });
            }

            // Return newUTXOs so the next TX can chain off this one — no block wait needed
            const chainedUtxos = approvalReceipt?.newUTXOs ?? undefined;
            console.log('[ensureAllowance] chaining UTXOs:', chainedUtxos?.length ?? 0);
            return { ok: true, chainedUtxos };
        } catch (err) {
            setStatus(null);
            const msg = (err as Error).message || String(err);
            if (msg.includes('sender') || msg.includes('address') || msg.includes('signer')) {
                setError('Wallet MLDSA keys not available. Ensure your OP_WALLET extension is up to date and try reconnecting.');
            } else {
                setError(`Approval failed: ${msg}`);
            }
            return { ok: false };
        }
    }, [motoContract, address, signer, p2trAddress, txParams]);

    const fetchBet = useCallback(async (betId: bigint): Promise<BetData | null> => {
        if (!contract) return null;
        try {
            const result = await contract.getBet(betId);
            return {
                betId,
                creator: result.properties.creator,
                acceptor: result.properties.acceptor,
                amount: result.properties.amount,
                status: result.properties.status,
                winner: result.properties.winner,
                blockNumber: result.properties.blockNumber,
            };
        } catch (err) {
            console.error(`[fetchBet ${betId}]`, err);
            return null;
        }
    }, [contract]);

    const fetchStats = useCallback(async (): Promise<GlobalStats | null> => {
        if (!contract) return null;
        try {
            const result = await contract.getStats();
            const s = result.properties as GlobalStats;
            setStats(s);
            statsRef.current = s;
            return s;
        } catch (err) {
            console.error('[fetchStats]', err);
            setError((err as Error).message);
            return null;
        }
    }, [contract]);

    const fetchFeeStats = useCallback(async () => {
        if (!contract) return;
        try {
            const result = await contract.getFeeStats();
            setFeeStats(result.properties);
        } catch (err) {
            console.error('[fetchFeeStats]', err);
        }
    }, [contract]);

    const fetchUserStats = useCallback(async () => {
        if (!contract || !isConnected || !address) return;
        try {
            const result = await contract.getUserStats(address);
            setUserStats(result.properties);
        } catch (err) {
            console.error('[fetchUserStats]', err);
        }
    }, [contract, isConnected, address]);

    const fetchOpenBets = useCallback(async (currentStats: GlobalStats | null) => {
        if (!contract || !currentStats) return;
        const nextId = currentStats.nextBetId;
        if (nextId <= 1n) {
            setOpenBets([]);
            return;
        }

        const bets: BetData[] = [];
        const BATCH_SIZE = 5;
        // Deployed contract pre-increments bet IDs, so latest bet ID === nextBetId
        for (let start = nextId; start >= 1n && bets.length < 50; start -= BigInt(BATCH_SIZE)) {
            const ids: bigint[] = [];
            for (let j = 0n; j < BigInt(BATCH_SIZE) && start - j >= 1n; j++) {
                ids.push(start - j);
            }
            const results = await Promise.all(ids.map((id) => fetchBet(id)));
            for (const bet of results) {
                if (bet && bet.status === BET_STATUS.OPEN) {
                    bets.push(bet);
                }
            }
        }
        setOpenBets(bets);
    }, [contract, fetchBet]);

    const refresh = useCallback(async () => {
        const currentStats = await fetchStats();
        await Promise.all([
            fetchFeeStats(),
            fetchUserStats(),
            fetchOpenBets(currentStats),
        ]);
        setInitialLoading(false);
    }, [fetchStats, fetchFeeStats, fetchUserStats, fetchOpenBets]);

    usePolling(refresh, POLL_INTERVAL, !!contract);

    const clearError = useCallback(() => setError(null), []);

    const createBet = useCallback(async (tierIndex: number): Promise<string | null> => {
        if (!contract || !p2trAddress || !isConnected) {
            const missing = [!contract && 'contract', !p2trAddress && 'p2trAddress', !isConnected && 'isConnected'].filter(Boolean).join(', ');
            setError(`Wallet not ready (missing: ${missing})`);
            return null;
        }
        setLoading(true);
        setError(null);
        setStatus(null);
        try {
            const tier = BET_TIERS[tierIndex];
            if (!tier) { setError('Invalid tier'); return null; }
            const betAmount = BigInt(tier.moto) * DECIMALS_MULTIPLIER;

            // Ensure allowance — returns chained UTXOs if approval TX was sent
            const allowance = await ensureAllowance(betAmount);
            if (!allowance.ok) return null;

            setStatus('Creating bet — confirm in OP_WALLET...');
            console.log('[createBet] calling contract.createBet with tierIndex:', tierIndex);
            const result = await contract.createBet(BigInt(tierIndex));
            console.log('[createBet] simulation OK, sending transaction, chained UTXOs:', allowance.chainedUtxos?.length ?? 'none');

            const blockBefore = provider ? BigInt(await (provider as any).getBlockNumber()) : 0n;
            const receipt = await result.sendTransaction(txParams(allowance.chainedUtxos));
            const txId = receipt.transactionId;
            console.log('[createBet] TX sent:', txId);
            addTx({ txId, type: 'create_bet', label: `Create Bet — ${tier.label} MOTO`, amount: `${formatMoto(betAmount)} MOTO` });

            // Wait for the TX to be mined before showing it as OPEN
            if (provider) {
                setStatus('Waiting for block confirmation...');
                await waitForNextBlock(provider, blockBefore);
            }
            setStatus(null);
            await refresh();
            return txId;
        } catch (err) {
            setStatus(null);
            console.error('[createBet] error:', err);
            setError((err as Error).message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [contract, p2trAddress, isConnected, txParams, ensureAllowance, refresh, provider]);

    const acceptBet = useCallback(async (betId: bigint): Promise<string | null> => {
        if (!contract || !p2trAddress || !isConnected) {
            const missing = [!contract && 'contract', !p2trAddress && 'p2trAddress', !isConnected && 'connected'].filter(Boolean).join(', ');
            setError(`Wallet not ready (missing: ${missing}). Reconnect OP_WALLET and try again.`);
            return null;
        }
        setLoading(true);
        setError(null);
        setStatus(null);
        try {
            // Fetch bet to know the amount for allowance
            setStatus('Loading bet details...');
            console.log('[acceptBet] fetching bet', betId.toString());
            const bet = await fetchBet(betId);
            if (!bet) {
                setError(`Could not load bet #${betId}. It may have been cancelled or already accepted.`);
                setStatus(null);
                return null;
            }
            if (bet.status !== 1n) {
                setError(`Bet #${betId} is no longer open (status: ${bet.status}).`);
                setStatus(null);
                return null;
            }
            console.log('[acceptBet] bet amount:', bet.amount.toString(), 'status:', bet.status.toString());

            // Ensure allowance — returns chained UTXOs if approval TX was sent
            setStatus('Checking MOTO allowance...');
            const allowance = await ensureAllowance(bet.amount);
            if (!allowance.ok) {
                console.warn('[acceptBet] allowance not approved');
                return null;
            }

            setStatus('Accepting bet — confirm in OP_WALLET...');
            console.log('[acceptBet] calling contract.acceptBet', betId.toString());
            const result = await contract.acceptBet(betId);
            console.log('[acceptBet] simulation OK, sending transaction, chained UTXOs:', allowance.chainedUtxos?.length ?? 'none');

            const blockBefore = provider ? BigInt(await (provider as any).getBlockNumber()) : 0n;
            const receipt = await result.sendTransaction(txParams(allowance.chainedUtxos));
            const txId = receipt.transactionId;
            console.log('[acceptBet] TX sent:', txId);
            addTx({ txId, type: 'accept_bet', label: `Accept Bet #${betId}`, amount: `${formatMoto(bet.amount)} MOTO` });

            if (provider) {
                setStatus('Waiting for block confirmation...');
                await waitForNextBlock(provider, blockBefore);
            }
            setStatus(null);
            await refresh();
            return txId;
        } catch (err) {
            setStatus(null);
            const msg = (err as Error).message || String(err);
            console.error('[acceptBet] error:', err);
            if (msg.includes('insufficient') || msg.includes('balance')) {
                setError(`Not enough MOTO to accept this bet. ${msg}`);
            } else if (msg.includes('sender') || msg.includes('address') || msg.includes('signer')) {
                setError(`Wallet issue: ${msg}. Try disconnecting and reconnecting OP_WALLET.`);
            } else if (msg.includes('allowance')) {
                setError(`MOTO approval issue: ${msg}. The contract needs permission to transfer your MOTO.`);
            } else if (msg.includes('revert') || msg.includes('execution')) {
                setError(`Transaction reverted: ${msg}. The bet may already be taken or cancelled.`);
            } else {
                setError(`Accept failed: ${msg}`);
            }
            return null;
        } finally {
            setLoading(false);
        }
    }, [contract, p2trAddress, isConnected, txParams, ensureAllowance, fetchBet, refresh, provider]);

    const cancelBet = useCallback(async (betId: bigint): Promise<string | null> => {
        if (!contract || !p2trAddress || !isConnected) {
            setError('Wallet not connected');
            return null;
        }
        setLoading(true);
        setError(null);
        try {
            const blockBefore = provider ? BigInt(await (provider as any).getBlockNumber()) : 0n;
            const result = await contract.cancelBet(betId);
            const receipt = await result.sendTransaction(txParams());
            const txId = receipt.transactionId;
            addTx({ txId, type: 'cancel_bet', label: `Cancel Bet #${betId}`, amount: '' });

            if (provider) {
                setStatus('Waiting for block confirmation...');
                await waitForNextBlock(provider, blockBefore);
            }
            setStatus(null);
            await refresh();
            return txId;
        } catch (err) {
            setError((err as Error).message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [contract, p2trAddress, isConnected, txParams, refresh, provider]);

    return {
        stats,
        feeStats,
        userStats,
        openBets,
        loading,
        initialLoading,
        error,
        status,
        lastTxId,
        clearError,
        createBet,
        acceptBet,
        cancelBet,
        refresh,
        fetchBet,
    };
}
