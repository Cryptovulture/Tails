import { useState, useCallback } from 'react';
import { useContract } from './useContract';
import { useWallet } from '../context/WalletContext';
import { useOPNet } from '../context/OPNetContext';
import { usePolling } from './usePolling';
import { FLIPTokenAbi } from '../abi/FLIPTokenAbi';
import { POLL_INTERVAL } from '../utils/constants';

export function useToken(tokenAddress: string, abi = FLIPTokenAbi) {
    const contract = useContract(tokenAddress, abi);
    const { address, p2trAddress, isConnected, signer, mldsaSigner } = useWallet();
    const { network } = useOPNet();

    const [balance, setBalance] = useState<bigint>(0n);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchBalance = useCallback(async () => {
        if (!contract || !isConnected || !address) return;
        try {
            const result = await contract.balanceOf(address);
            setBalance(result.properties.balance);
        } catch (err) {
            console.error('[fetchBalance]', err);
        }
    }, [contract, isConnected, address]);

    usePolling(fetchBalance, POLL_INTERVAL, !!contract && isConnected);

    const getAllowance = useCallback(async (spenderAddress: unknown): Promise<bigint> => {
        if (!contract || !isConnected || !address) return 0n;
        try {
            const result = await contract.allowance(address, spenderAddress);
            return result.properties.remaining;
        } catch (err) {
            console.error('[getAllowance]', err);
            return 0n;
        }
    }, [contract, isConnected, address]);

    const approve = useCallback(async (spender: unknown, amount: bigint): Promise<string | null> => {
        if (!contract || !p2trAddress || !isConnected) return null;
        setLoading(true);
        setError(null);
        try {
            const result = await contract.increaseAllowance(spender, amount);
            const receipt = await result.sendTransaction({
                signer,
                mldsaSigner,
                refundTo: p2trAddress,
                maximumAllowedSatToSpend: 100_000n,
                network,
            });
            return receipt.transactionId;
        } catch (err) {
            console.error('[approve]', err);
            setError((err as Error).message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [contract, p2trAddress, isConnected, signer, mldsaSigner, network]);

    return {
        balance,
        loading,
        error,
        fetchBalance,
        getAllowance,
        approve,
    };
}
