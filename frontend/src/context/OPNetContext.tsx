import { createContext, useContext, useRef, useMemo, useState, useEffect, type ReactNode } from 'react';
import type { Network } from '@btc-vision/bitcoin';
import { RPC_URL, NETWORK } from '../config/contracts';

interface OPNetContextValue {
    provider: unknown;
    network: Network;
    getContractCached: (
        address: string,
        abi: unknown,
        sender?: unknown,
    ) => unknown;
    ready: boolean;
}

const OPNetContext = createContext<OPNetContextValue | null>(null);

export function OPNetProvider({ children }: { children: ReactNode }) {
    const [ready, setReady] = useState(false);
    const providerRef = useRef<unknown>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contractCacheRef = useRef<Map<string, any>>(new Map());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opnetRef = useRef<any>(null);

    useEffect(() => {
        import('opnet').then((mod) => {
            opnetRef.current = mod;
            try {
                providerRef.current = new mod.JSONRpcProvider({ url: RPC_URL, network: NETWORK });
            } catch (err) {
                console.error('[OPNetProvider] Failed to create provider:', err);
            }
            setReady(true);
        }).catch((err) => {
            console.error('[OPNetProvider] Failed to load opnet:', err);
            setReady(true);
        });
    }, []);

    const value = useMemo<OPNetContextValue>(() => ({
        provider: providerRef.current,
        network: NETWORK,
        ready,
        getContractCached: (
            address: string,
            abi: unknown,
            sender?: unknown,
        ) => {
            if (!opnetRef.current || !providerRef.current) return null;

            const senderKey = sender && typeof sender === 'object' && 'toHex' in sender
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ? (sender as any).toHex() : 'none';
            const cacheKey = `${address}:${String(senderKey)}`;
            const cached = contractCacheRef.current.get(cacheKey);
            if (cached) return cached;

            const contract = opnetRef.current.getContract(
                address,
                abi,
                providerRef.current,
                NETWORK,
                sender,
            );
            contractCacheRef.current.set(cacheKey, contract);
            return contract;
        },
    }), [ready]);

    return (
        <OPNetContext.Provider value={value}>
            {children}
        </OPNetContext.Provider>
    );
}

export function useOPNet(): OPNetContextValue {
    const ctx = useContext(OPNetContext);
    if (!ctx) throw new Error('useOPNet must be used within OPNetProvider');
    return ctx;
}
