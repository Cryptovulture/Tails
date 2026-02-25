import type { UserStats as UserStatsType } from '../../hooks/useTails';
import { formatMoto } from '../../utils/format';
import './UserStats.css';

interface UserStatsProps {
    userStats: UserStatsType | null;
    isConnected: boolean;
}

export function UserStats({ userStats, isConnected }: UserStatsProps) {
    if (!isConnected) {
        return (
            <div className="user-stats">
                <h3 className="user-stats-title">Your Stats</h3>
                <p className="user-stats-connect">Connect wallet to view your stats</p>
            </div>
        );
    }

    if (!userStats) {
        return (
            <div className="user-stats">
                <h3 className="user-stats-title">Your Stats</h3>
                <p className="user-stats-connect">Loading...</p>
            </div>
        );
    }

    const winRate = userStats.totalBets > 0n
        ? ((Number(userStats.totalWins) / Number(userStats.totalBets)) * 100).toFixed(1)
        : '0.0';

    return (
        <div className="user-stats">
            <h3 className="user-stats-title">Your Stats</h3>
            <div className="user-stats-grid">
                <div className="user-stat">
                    <span className="user-stat-label">Total Bets</span>
                    <span className="user-stat-value">{userStats.totalBets.toString()}</span>
                </div>
                <div className="user-stat">
                    <span className="user-stat-label">Wins</span>
                    <span className="user-stat-value green">{userStats.totalWins.toString()}</span>
                </div>
                <div className="user-stat">
                    <span className="user-stat-label">Win Rate</span>
                    <span className="user-stat-value">{winRate}%</span>
                </div>
                <div className="user-stat">
                    <span className="user-stat-label">Volume</span>
                    <span className="user-stat-value gold">{formatMoto(userStats.totalVolume)} MOTO</span>
                </div>
            </div>
        </div>
    );
}
