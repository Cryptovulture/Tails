import { useState, useCallback } from 'react';
import { useContract } from './useContract';
import { useWallet } from '../context/WalletContext';
import { useOPNet } from '../context/OPNetContext';
import { usePolling } from './usePolling';
import { FLIPStakingAbi } from '../abi/FLIPStakingAbi';
import { STAKING_ADDRESS } from '../config/contracts';
import { POLL_INTERVAL } from '../utils/constants';

export interface StakeInfo {
    stakedBalance: bigint;
    pendingRewards: bigint;
}

export interface PoolStats {
    totalStaked: bigint;
    rewardPerToken: bigint;
    totalDistributed: bigint;
}

export function useStaking() {
    const contract = useContract(STAKING_ADDRESS, FLIPStakingAbi);
    const { address, p2trAddress, isConnected, signer, mldsaSigner } = useWallet();
    const { network } = useOPNet();

    const [stakeInfo, setStakeInfo] = useState<StakeInfo | null>(null);
    const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStakeInfo = useCallback(async () => {
        if (!contract || !isConnected || !address) return;
        try {
            const result = await contract.getStakeInfo(address);
            setStakeInfo(result.properties);
        } catch (err) {
            console.error('[fetchStakeInfo]', err);
        }
    }, [contract, isConnected, address]);

    const fetchPoolStats = useCallback(async () => {
        if (!contract) return;
        try {
            const result = await contract.getPoolStats();
            setPoolStats(result.properties);
        } catch (err) {
            console.error('[fetchPoolStats]', err);
        }
    }, [contract]);

    const refresh = useCallback(async () => {
        await Promise.all([fetchPoolStats(), fetchStakeInfo()]);
    }, [fetchPoolStats, fetchStakeInfo]);

    usePolling(refresh, POLL_INTERVAL, !!contract);

    const clearError = useCallback(() => setError(null), []);

    const stake = useCallback(async (amount: bigint): Promise<string | null> => {
        if (!contract || !p2trAddress || !isConnected) {
            setError('Wallet not connected');
            return null;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await contract.stake(amount);
            const receipt = await result.sendTransaction({
                signer,
                mldsaSigner,
                refundTo: p2trAddress,
                maximumAllowedSatToSpend: 100_000n,
                network,
            });
            await refresh();
            return receipt.transactionId;
        } catch (err) {
            setError((err as Error).message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [contract, p2trAddress, isConnected, signer, mldsaSigner, network, refresh]);

    const unstake = useCallback(async (amount: bigint): Promise<string | null> => {
        if (!contract || !p2trAddress || !isConnected) {
            setError('Wallet not connected');
            return null;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await contract.unstake(amount);
            const receipt = await result.sendTransaction({
                signer,
                mldsaSigner,
                refundTo: p2trAddress,
                maximumAllowedSatToSpend: 100_000n,
                network,
            });
            await refresh();
            return receipt.transactionId;
        } catch (err) {
            setError((err as Error).message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [contract, p2trAddress, isConnected, signer, mldsaSigner, network, refresh]);

    const claimRewards = useCallback(async (): Promise<string | null> => {
        if (!contract || !p2trAddress || !isConnected) {
            setError('Wallet not connected');
            return null;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await contract.claimRewards();
            const receipt = await result.sendTransaction({
                signer,
                mldsaSigner,
                refundTo: p2trAddress,
                maximumAllowedSatToSpend: 100_000n,
                network,
            });
            await refresh();
            return receipt.transactionId;
        } catch (err) {
            setError((err as Error).message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [contract, p2trAddress, isConnected, signer, mldsaSigner, network, refresh]);

    return {
        stakeInfo,
        poolStats,
        loading,
        error,
        clearError,
        stake,
        unstake,
        claimRewards,
        refresh,
    };
}
