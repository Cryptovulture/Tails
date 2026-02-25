import type { CSSProperties } from 'react';
import './BetResultModal.css';

interface BetResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    won: boolean | null;
    amount: number;
}

function formatAmount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
    return n.toString();
}

export function BetResultModal({ isOpen, onClose, won, amount }: BetResultModalProps) {
    if (!isOpen) return null;

    const amountStr = formatAmount(amount);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-card result-modal" onClick={(e) => e.stopPropagation()}>
                <div className={`result-coin ${won === true ? 'win-flip' : won === false ? 'lose-flip' : ''}`}>
                    <div className="result-coin-face result-coin-front">
                        <img className="result-coin-logo" src="/moto-logo.jpg" alt="MOTO" />
                    </div>
                    <div className="result-coin-face result-coin-back">
                        <img className="result-coin-logo" src="/tails.png" alt="TAILS" />
                    </div>
                </div>

                {won === true && (
                    <div className="result-content win-state">
                        <h2 className="result-title">YOU WIN!</h2>
                        <p className="result-amount">+{amountStr} MOTO</p>
                        <div className="confetti-container">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <span key={i} className="confetti-piece" style={{ '--i': i } as CSSProperties} />
                            ))}
                        </div>
                    </div>
                )}

                {won === false && (
                    <div className="result-content lose-state">
                        <h2 className="result-title">Better luck next time</h2>
                        <p className="result-amount">-{amountStr} MOTO</p>
                    </div>
                )}

                {won === null && (
                    <div className="result-content pending-state">
                        <h2 className="result-title">Bet Created!</h2>
                        <p className="result-amount">{amountStr} MOTO</p>
                        <p className="result-sub">Waiting for opponent...</p>
                    </div>
                )}

                <button className="modal-close-btn" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
