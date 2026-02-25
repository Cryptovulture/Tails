import type { BetData } from '../../hooks/useTails';
import { formatMoto } from '../../utils/format';
import { BET_STATUS_LABELS } from '../../utils/constants';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import './BetCard.css';

interface BetCardProps {
    bet: BetData;
    isOwn: boolean;
    index?: number;
    onAccept?: (betId: bigint) => void;
    onCancel?: (betId: bigint) => void;
    loading?: boolean;
    isConnected?: boolean;
}

export function BetCard({ bet, isOwn, index = 0, onAccept, onCancel, loading, isConnected }: BetCardProps) {
    const statusLabel = BET_STATUS_LABELS[bet.status.toString()] ?? 'Unknown';
    const isOpen = bet.status === 1n;

    return (
        <div
            className={`bet-card ${isOpen ? 'open' : ''}`}
            style={{ animationDelay: `${index * 0.06}s` }}
        >
            <div className="bet-card-header">
                <span className="bet-id">#{bet.betId.toString()}</span>
                <span className={`bet-status status-${statusLabel.toLowerCase()}`}>
                    {statusLabel}
                </span>
            </div>

            <div className="bet-amount">
                {formatMoto(bet.amount)} <span className="bet-currency">MOTO</span>
            </div>

            {isOpen && (
                <div className="bet-actions">
                    {!isConnected ? (
                        <span className="bet-connect-hint">Connect wallet to bet</span>
                    ) : isOwn ? (
                        <button
                            className="btn btn-cancel"
                            onClick={() => onCancel?.(bet.betId)}
                            disabled={loading}
                        >
                            {loading ? <LoadingSpinner size={16} /> : 'Cancel'}
                        </button>
                    ) : (
                        <button
                            className="btn btn-accept"
                            onClick={() => onAccept?.(bet.betId)}
                            disabled={loading}
                        >
                            {loading ? <LoadingSpinner size={16} /> : 'Accept Bet'}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
