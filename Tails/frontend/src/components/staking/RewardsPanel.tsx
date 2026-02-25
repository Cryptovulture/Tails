import { formatMoto } from '../../utils/format';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import './RewardsPanel.css';

interface RewardsPanelProps {
    pendingRewards: bigint;
    onClaim: () => Promise<string | null>;
    loading: boolean;
}

export function RewardsPanel({ pendingRewards, onClaim, loading }: RewardsPanelProps) {
    return (
        <div className="rewards-panel">
            <h3 className="panel-title">MOTO Rewards</h3>

            <div className="reward-amount">
                <span className="reward-label">Pending Rewards</span>
                <span className="reward-value">{formatMoto(pendingRewards)} MOTO</span>
            </div>

            <button
                className="btn btn-claim"
                onClick={onClaim}
                disabled={loading || pendingRewards === 0n}
            >
                {loading ? <LoadingSpinner size={16} /> : 'Claim Rewards'}
            </button>
        </div>
    );
}
