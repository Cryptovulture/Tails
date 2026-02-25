import type { FeeStats } from '../../hooks/useTails';
import { formatMoto } from '../../utils/format';
import './FeeBreakdown.css';

interface FeeBreakdownProps {
    feeStats: FeeStats | null;
}

export function FeeBreakdown({ feeStats }: FeeBreakdownProps) {
    if (!feeStats) {
        return (
            <div className="fee-breakdown">
                <h3 className="fee-title">Fee Distribution</h3>
                <p className="fee-loading">Loading...</p>
            </div>
        );
    }

    const total = feeStats.stakerFees + feeStats.buybackFees + feeStats.treasuryFees;
    // Use proportional values to avoid BigInt-to-Number precision loss
    const divisor = total > 0n ? total / 1000n || 1n : 1n;

    return (
        <div className="fee-breakdown">
            <h3 className="fee-title">Fee Distribution</h3>

            <div className="fee-bar">
                {total > 0n && (
                    <>
                        <div
                            className="fee-segment staker"
                            style={{ flex: Number(feeStats.stakerFees / divisor) }}
                            title="Stakers"
                        />
                        <div
                            className="fee-segment buyback"
                            style={{ flex: Number(feeStats.buybackFees / divisor) }}
                            title="Buyback & Burn"
                        />
                        <div
                            className="fee-segment treasury"
                            style={{ flex: Number(feeStats.treasuryFees / divisor) }}
                            title="Treasury"
                        />
                    </>
                )}
            </div>

            <div className="fee-details">
                <div className="fee-row">
                    <span className="fee-dot staker" />
                    <span className="fee-label">Stakers (25%)</span>
                    <span className="fee-value">{formatMoto(feeStats.stakerFees)} MOTO</span>
                </div>
                <div className="fee-row">
                    <span className="fee-dot buyback" />
                    <span className="fee-label">Buyback & Burn (25%)</span>
                    <span className="fee-value">{formatMoto(feeStats.buybackFees)} MOTO</span>
                </div>
                <div className="fee-row">
                    <span className="fee-dot treasury" />
                    <span className="fee-label">Treasury (50%)</span>
                    <span className="fee-value">{formatMoto(feeStats.treasuryFees)} MOTO</span>
                </div>
            </div>
        </div>
    );
}
