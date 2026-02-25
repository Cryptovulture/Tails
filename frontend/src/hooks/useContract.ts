import { useMemo } from 'react';
import { useOPNet } from '../context/OPNetContext';
import { useWallet } from '../context/WalletContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useContract(address: string, abi: unknown): any {
    const { getContractCached, ready } = useOPNet();
    const { address: walletAddress } = useWallet();

    return useMemo(() => {
        if (!address || !ready) return null;
        return getContractCached(address, abi, walletAddress ?? undefined);
    }, [address, abi, walletAddress, getContractCached, ready]);
}
