import { BET_TIERS } from '../../config/contracts';
import './TierSelector.css';

interface TierSelectorProps {
    selectedTier: number | null;
    quantity: number;
    onSelect: (tierIndex: number | null) => void;
    onQuantityChange: (qty: number) => void;
    disabled?: boolean;
}

export function getSelectedMoto(tierIndex: number | null, quantity: number): number {
    if (tierIndex === null || quantity <= 0) return 0;
    const tier = BET_TIERS[tierIndex];
    return tier ? tier.moto * quantity : 0;
}

function getChipLayout(moto: number): number[] {
    if (moto <= 10) return [1];
    if (moto <= 25) return [2];
    if (moto <= 50) return [3];
    if (moto <= 100) return [4];
    if (moto <= 250) return [5];
    if (moto <= 500) return [4, 2];
    if (moto <= 1_000) return [5, 3];
    if (moto <= 2_500) return [6, 3];
    if (moto <= 5_000) return [6, 4];
    if (moto <= 10_000) return [7, 4];
    if (moto <= 25_000) return [7, 5];
    if (moto <= 50_000) return [8, 5];
    return [8, 6];
}

function ChipColumn({ count }: { count: number }) {
    return (
        <div className="chip-col">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className={`chip ${i === 0 ? 'chip-top' : ''}`}
                    style={{ zIndex: count - i }}
                >
                    <div className="chip-edge" />
                    <div className="chip-face">
                        <div className="chip-rim">
                            {i === 0 && (
                                <img className="chip-logo" src="/moto-logo.jpg" alt="" />
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function formatAmount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
    return n.toString();
}

export function TierSelector({ selectedTier, quantity, onSelect, onQuantityChange, disabled }: TierSelectorProps) {
    const toggleTier = (tierIndex: number) => {
        if (selectedTier === tierIndex) {
            onSelect(null);
            onQuantityChange(0);
        } else {
            onSelect(tierIndex);
            onQuantityChange(1);
        }
    };

    const totalMoto = getSelectedMoto(selectedTier, quantity);
    const selectedLabel = selectedTier !== null ? BET_TIERS[selectedTier]?.label : null;

    return (
        <div className="tier-selector">
            <h3 className="tier-title">Pick Your Bet (MOTO)</h3>
            <div className="tier-grid">
                {BET_TIERS.map((tier) => {
                    const active = selectedTier === tier.index;
                    const layout = getChipLayout(tier.moto);
                    return (
                        <div key={tier.index} className="tier-cell">
                            {active && quantity > 0 && (
                                <div className="tier-pm">
                                    <button
                                        className="pm-btn"
                                        onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                                        disabled={disabled || quantity <= 1}
                                    >
                                        -
                                    </button>
                                    <span className="pm-count">{quantity}</span>
                                    <button
                                        className="pm-btn"
                                        onClick={() => onQuantityChange(quantity + 1)}
                                        disabled={disabled}
                                    >
                                        +
                                    </button>
                                </div>
                            )}
                            <button
                                className={`stack-btn ${active ? 'active' : ''}`}
                                onClick={() => toggleTier(tier.index)}
                                disabled={disabled}
                            >
                                <div className="stack-arr">
                                    {layout.map((chips, s) => (
                                        <ChipColumn key={s} count={chips} />
                                    ))}
                                </div>
                                <span className="stack-label">{tier.label}</span>
                            </button>
                        </div>
                    );
                })}
            </div>

            {selectedTier !== null && quantity > 0 && (
                <div className="bet-summary">
                    {quantity === 1 ? (
                        <>
                            <span className="bet-summary-label">1 bet at</span>
                            <strong className="bet-summary-total">{selectedLabel} MOTO</strong>
                        </>
                    ) : (
                        <>
                            <span className="bet-summary-label">
                                {quantity} bets of {selectedLabel} MOTO =
                            </span>
                            <strong className="bet-summary-total">{formatAmount(totalMoto)} MOTO</strong>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
