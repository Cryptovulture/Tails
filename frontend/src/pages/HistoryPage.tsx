import { useTxHistory, type TxRecord, type TxStatus } from '../context/TxHistoryContext';
import { useWallet } from '../context/WalletContext';
import './HistoryPage.css';

const TYPE_ICONS: Record<string, string> = {
    approval: 'Approve',
    create_bet: 'Create',
    accept_bet: 'Accept',
    cancel_bet: 'Cancel',
    stake: 'Stake',
    unstake: 'Unstake',
    claim: 'Claim',
};

function StatusBadge({ status }: { status: TxStatus }) {
    return (
        <span className={`tx-status-badge status-${status}`}>
            {status === 'pending' && <span className="status-dot pending-dot" />}
            {status}
        </span>
    );
}

function timeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function TxRow({ tx }: { tx: TxRecord }) {
    const typeLabel = TYPE_ICONS[tx.type] ?? tx.type;

    return (
        <a
            className="tx-row"
            href={tx.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
        >
            <div className="tx-row-left">
                <span className={`tx-type-badge type-${tx.type}`}>{typeLabel}</span>
                <div className="tx-row-info">
                    <span className="tx-label">{tx.label}</span>
                    <span className="tx-hash">{tx.txId.slice(0, 10)}...{tx.txId.slice(-6)}</span>
                </div>
            </div>
            <div className="tx-row-right">
                {tx.amount && <span className="tx-amount">{tx.amount}</span>}
                <StatusBadge status={tx.status} />
                <span className="tx-time">{timeAgo(tx.timestamp)}</span>
            </div>
        </a>
    );
}

export function HistoryPage() {
    const { transactions, clearHistory } = useTxHistory();
    const { isConnected } = useWallet();

    const pending = transactions.filter((t) => t.status === 'pending');
    const completed = transactions.filter((t) => t.status !== 'pending');

    return (
        <div className="history-page">
            <div className="page-header">
                <h1 className="page-title-gradient">Transaction History</h1>
                <p className="page-subtitle">Track your pending and confirmed transactions</p>
            </div>

            {!isConnected && (
                <div className="connect-prompt">
                    Connect your wallet to see transaction history
                </div>
            )}

            {transactions.length === 0 && isConnected && (
                <div className="history-empty">
                    <div className="history-empty-icon">&#x1F4CB;</div>
                    <p className="history-empty-title">No transactions yet</p>
                    <p className="history-empty-sub">Create a bet to get started</p>
                </div>
            )}

            {pending.length > 0 && (
                <div className="history-section">
                    <h3 className="history-section-title">
                        Pending
                        <span className="pending-count">{pending.length}</span>
                    </h3>
                    <div className="tx-list">
                        {pending.map((tx) => <TxRow key={tx.txId} tx={tx} />)}
                    </div>
                </div>
            )}

            {completed.length > 0 && (
                <div className="history-section">
                    <h3 className="history-section-title">Completed</h3>
                    <div className="tx-list">
                        {completed.map((tx) => <TxRow key={tx.txId} tx={tx} />)}
                    </div>
                </div>
            )}

            {transactions.length > 0 && (
                <button className="clear-history-btn" onClick={clearHistory}>
                    Clear History
                </button>
            )}
        </div>
    );
}
