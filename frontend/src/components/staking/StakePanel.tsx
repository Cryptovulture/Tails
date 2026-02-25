import { useState } from 'react';
import { formatFlip, parseFlipInput, isValidNumericInput } from '../../utils/format';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import './StakePanel.css';

interface StakePanelProps {
    stakedBalance: bigint;
    flipBalance: bigint;
    onStake: (amount: bigint) => Promise<string | null>;
    onUnstake: (amount: bigint) => Promise<string | null>;
    loading: boolean;
}

export function StakePanel({ stakedBalance, flipBalance, onStake, onUnstake, loading }: StakePanelProps) {
    const [stakeInput, setStakeInput] = useState('');
    const [unstakeInput, setUnstakeInput] = useState('');

    const handleNumericInput = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '' || isValidNumericInput(val)) {
            setter(val);
        }
    };

    const handleStake = async () => {
        if (!stakeInput) return;
        const amount = parseFlipInput(stakeInput);
        if (amount <= 0n) return;
        await onStake(amount);
        setStakeInput('');
    };

    const handleUnstake = async () => {
        if (!unstakeInput) return;
        const amount = parseFlipInput(unstakeInput);
        if (amount <= 0n) return;
        await onUnstake(amount);
        setUnstakeInput('');
    };

    return (
        <div className="stake-panel">
            <h3 className="panel-title">Stake FLIP</h3>

            <div className="balance-row">
                <span className="balance-label">Wallet Balance</span>
                <span className="balance-value">{formatFlip(flipBalance)} FLIP</span>
            </div>
            <div className="balance-row">
                <span className="balance-label">Staked Balance</span>
                <span className="balance-value staked">{formatFlip(stakedBalance)} FLIP</span>
            </div>

            <div className="stake-action">
                <div className="input-group">
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Amount to stake"
                        value={stakeInput}
                        onChange={handleNumericInput(setStakeInput)}
                        disabled={loading}
                    />
                    <button
                        className="btn-max"
                        onClick={() => setStakeInput(formatFlip(flipBalance))}
                    >
                        MAX
                    </button>
                </div>
                <button className="btn btn-stake" onClick={handleStake} disabled={loading || !stakeInput}>
                    {loading ? <LoadingSpinner size={16} /> : 'Stake'}
                </button>
            </div>

            <div className="stake-action">
                <div className="input-group">
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Amount to unstake"
                        value={unstakeInput}
                        onChange={handleNumericInput(setUnstakeInput)}
                        disabled={loading}
                    />
                    <button
                        className="btn-max"
                        onClick={() => setUnstakeInput(formatFlip(stakedBalance))}
                    >
                        MAX
                    </button>
                </div>
                <button className="btn btn-unstake" onClick={handleUnstake} disabled={loading || !unstakeInput}>
                    {loading ? <LoadingSpinner size={16} /> : 'Unstake'}
                </button>
            </div>
        </div>
    );
}
