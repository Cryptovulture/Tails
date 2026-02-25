import { NavLink } from 'react-router-dom';
import { ConnectButton } from '../shared/ConnectButton';
import { useTxHistory } from '../../context/TxHistoryContext';
import './Header.css';

export function Header() {
    const { transactions } = useTxHistory();
    const pendingCount = transactions.filter((t) => t.status === 'pending').length;

    return (
        <header className="header">
            <div className="header-inner">
                <NavLink to="/" className="logo">
                    <span className="logo-chip">
                        <img className="logo-icon" src="/moto-logo.jpg" alt="MOTO" />
                    </span>
                    <span className="logo-text">Tails</span>
                </NavLink>

                <nav className="nav">
                    <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} end>
                        Game
                    </NavLink>
                    <span className="nav-divider" />
                    <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        History
                        {pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
                    </NavLink>
                    <span className="nav-divider" />
                    <NavLink to="/staking" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        Staking
                    </NavLink>
                    <span className="nav-divider" />
                    <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        Dashboard
                    </NavLink>
                </nav>

                <ConnectButton />
            </div>
            <div className="header-trim" />
        </header>
    );
}
