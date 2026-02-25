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
                    <img className="logo-icon" src="/moto-logo.jpg" alt="MOTO" />
                    <span className="logo-text">Tails</span>
                </NavLink>

                <nav className="nav">
                    <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} end>
                        Game
                    </NavLink>
                    <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        History
                        {pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
                    </NavLink>
                    <NavLink to="/staking" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        Staking
                    </NavLink>
                    <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        Dashboard
                    </NavLink>
                </nav>

                <ConnectButton />
            </div>
        </header>
    );
}
