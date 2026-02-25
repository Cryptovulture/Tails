import { createContext, useContext, useMemo, useEffect, type ReactNode } from 'react';
import {
    WalletConnectProvider,
    useWalletConnect,
} from '@btc-vision/walletconnect';
// Browser bundle doesn't auto-import CSS — load from local copy
import '../styles/walletconnect.css';

interface WalletContextValue {
    address: unknown;
    p2trAddress: string | null;
    isConnected: boolean;
    connect: () => void;
    disconnect: () => void;
    signer: unknown;
    mldsaSigner: unknown;
    signMLDSAMessage: (message: string) => Promise<unknown>;
    ready: boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function WalletConnectInner({ children }: { children: ReactNode }) {
    const wallet = useWalletConnect();

    // Debug: log wallet state changes so we can see what keys are available
    useEffect(() => {
        console.log('[WalletContext] wallet state:', {
            walletAddress: wallet.walletAddress,
            address: wallet.address,
            publicKey: wallet.publicKey,
            mldsaPublicKey: wallet.mldsaPublicKey,
            hashedMLDSAKey: wallet.hashedMLDSAKey,
            hasSigner: !!wallet.signer,
        });
    }, [wallet.walletAddress, wallet.address, wallet.publicKey, wallet.mldsaPublicKey, wallet.hashedMLDSAKey, wallet.signer]);

    const value = useMemo<WalletContextValue>(() => ({
        address: wallet.address ?? null,
        p2trAddress: wallet.walletAddress ?? null,
        isConnected: wallet.walletAddress !== null,
        connect: () => wallet.openConnectModal(),
        disconnect: () => wallet.disconnect(),
        signer: wallet.signer ?? null,
        mldsaSigner: null, // OP_WALLET handles ML-DSA internally via Web3Provider
        signMLDSAMessage: wallet.signMLDSAMessage,
        ready: true,
    }), [
        wallet.address, wallet.walletAddress,
        wallet.openConnectModal, wallet.disconnect, wallet.signer,
        wallet.signMLDSAMessage,
    ]);

    return (
        <WalletContext.Provider value={value}>
            {children}
        </WalletContext.Provider>
    );
}

export function WalletProvider({ children }: { children: ReactNode }) {
    return (
        <WalletConnectProvider theme="dark">
            <WalletConnectInner>
                {children}
            </WalletConnectInner>
        </WalletConnectProvider>
    );
}

export function useWallet(): WalletContextValue {
    const ctx = useContext(WalletContext);
    if (!ctx) throw new Error('useWallet must be used within WalletProvider');
    return ctx;
}
