import './StatsCard.css';

interface StatsCardProps {
    label: string;
    value: string;
    sub?: string;
    accent?: 'green' | 'gold' | 'blue' | 'red';
}

export function StatsCard({ label, value, sub, accent = 'green' }: StatsCardProps) {
    return (
        <div className={`stats-card accent-${accent}`}>
            <span className="stats-label">{label}</span>
            <span className="stats-value">{value}</span>
            {sub && <span className="stats-sub">{sub}</span>}
        </div>
    );
}
