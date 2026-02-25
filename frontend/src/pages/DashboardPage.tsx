import { useTails } from '../hooks/useTails';
import { useWallet } from '../context/WalletContext';
import { StatsCard } from '../components/dashboard/StatsCard';
import { FeeBreakdown } from '../components/dashboard/FeeBreakdown';
import { UserStats } from '../components/dashboard/UserStats';
import { formatMoto } from '../utils/format';
import './DashboardPage.css';

export function DashboardPage() {
    const { isConnected } = useWallet();
    const { stats, feeStats, userStats } = useTails();

    return (
        <div className="dashboard-page">
            <div className="page-header">
                <h1 className="page-title-gradient">Dashboard</h1>
                <p className="page-subtitle">Protocol statistics and performance</p>
            </div>

            <div className="global-stats-grid">
                <StatsCard
                    label="Total Bets"
                    value={stats?.totalBets.toString() ?? '0'}
                    accent="blue"
                />
                <StatsCard
                    label="Total Volume"
                    value={stats ? formatMoto(stats.totalVolume) : '0'}
                    sub="MOTO"
                    accent="gold"
                />
                <StatsCard
                    label="Total Fees"
                    value={stats ? formatMoto(stats.totalFees) : '0'}
                    sub="MOTO"
                    accent="green"
                />
                <StatsCard
                    label="Next Bet ID"
                    value={stats?.nextBetId.toString() ?? '1'}
                    accent="blue"
                />
            </div>

            <div className="dashboard-panels">
                <FeeBreakdown feeStats={feeStats} />
                <UserStats userStats={userStats} isConnected={isConnected} />
            </div>
        </div>
    );
}
