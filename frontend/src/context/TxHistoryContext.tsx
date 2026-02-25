import { createContext, useContext, useCallback, useState, type ReactNode } from 'react';
import { EXPLORER_URL } from '../config/contracts';

export type TxStatus = 'pending' | 'confirmed' | 'failed';
export type TxType = 'approval' | 'create_bet' | 'accept_bet' | 'cancel_bet' | 'stake' | 'unstake' | 'claim';

export interface TxRecord {
    txId: string;
    type: TxType;
    label: string;
    amount: string;
    status: TxStatus;
    timestamp: number;
    explorerUrl: string;
}

interface TxHistoryContextValue {
    transactions: TxRecord[];
    addTx: (tx: Omit<TxRecord, 'timestamp' | 'explorerUrl' | 'status'>) => void;
    updateTxStatus: (txId: string, status: TxStatus) => void;
    clearHistory: () => void;
}

const TxHistoryContext = createContext<TxHistoryContextValue | null>(null);

const STORAGE_KEY = 'tails_tx_history';

function loadFromStorage(): TxRecord[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as TxRecord[];
    } catch {
        return [];
    }
}

function saveToStorage(txs: TxRecord[]) {
    try {
        // Keep last 100 transactions
        localStorage.setItem(STORAGE_KEY, JSON.stringify(txs.slice(0, 100)));
    } catch { /* storage full or unavailable */ }
}

export function TxHistoryProvider({ children }: { children: ReactNode }) {
    const [transactions, setTransactions] = useState<TxRecord[]>(loadFromStorage);

    const addTx = useCallback((tx: Omit<TxRecord, 'timestamp' | 'explorerUrl' | 'status'>) => {
        setTransactions((prev) => {
            // Don't add duplicates
            if (prev.some((t) => t.txId === tx.txId)) return prev;
            const record: TxRecord = {
                ...tx,
                status: 'pending',
                timestamp: Date.now(),
                explorerUrl: `${EXPLORER_URL}/tx/${tx.txId}`,
            };
            const next = [record, ...prev];
            saveToStorage(next);
            return next;
        });
    }, []);

    const updateTxStatus = useCallback((txId: string, status: TxStatus) => {
        setTransactions((prev) => {
            const next = prev.map((t) => t.txId === txId ? { ...t, status } : t);
            saveToStorage(next);
            return next;
        });
    }, []);

    const clearHistory = useCallback(() => {
        setTransactions([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return (
        <TxHistoryContext.Provider value={{ transactions, addTx, updateTxStatus, clearHistory }}>
            {children}
        </TxHistoryContext.Provider>
    );
}

export function useTxHistory(): TxHistoryContextValue {
    const ctx = useContext(TxHistoryContext);
    if (!ctx) throw new Error('useTxHistory must be used within TxHistoryProvider');
    return ctx;
}
