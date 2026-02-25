import type { BetData } from '../../hooks/useTails';
import { BetCard } from './BetCard';
import './OpenBetsList.css';

interface OpenBetsListProps {
    bets: BetData[];
    walletAddressBigInt: bigint | null;
    onAccept: (betId: bigint) => void;
    onCancel: (betId: bigint) => void;
    loading: boolean;
    isConnected: boolean;
}

export function OpenBetsList({ bets, walletAddressBigInt, onAccept, onCancel, loading, isConnected }: OpenBetsListProps) {
    if (bets.length === 0) {
        return (
            <div className="open-bets">
                <h3 className="open-bets-title">Open Bets</h3>
                <div className="no-bets">
                    <div className="no-bets-icon">&#x1F3B0;</div>
                    <p className="no-bets-text">No open bets yet</p>
                    <p className="no-bets-sub">Be the first to flip a coin</p>
                </div>
            </div>
        );
    }

    return (
        <div className="open-bets">
            <h3 className="open-bets-title">
                Open Bets <span className="bet-count">{bets.length}</span>
            </h3>
            <div className="bets-grid">
                {bets.map((bet, index) => (
                    <BetCard
                        key={bet.betId.toString()}
                        bet={bet}
                        index={index}
                        isOwn={walletAddressBigInt !== null && bet.creator === walletAddressBigInt}
                        onAccept={isConnected ? onAccept : undefined}
                        onCancel={isConnected ? onCancel : undefined}
                        loading={loading}
                        isConnected={isConnected}
                    />
                ))}
            </div>
        </div>
    );
}
