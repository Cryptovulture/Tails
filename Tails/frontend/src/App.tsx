import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { OPNetProvider } from './context/OPNetContext';
import { WalletProvider } from './context/WalletContext';
import { TxHistoryProvider } from './context/TxHistoryContext';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';

const GamePage = lazy(() => import('./pages/GamePage').then(m => ({ default: m.GamePage })));
const StakingPage = lazy(() => import('./pages/StakingPage').then(m => ({ default: m.StakingPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })));

function PageLoader() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '12px', color: '#505068' }}>
            <div className="spinner" style={{ width: 20, height: 20 }} />
        </div>
    );
}

export function App() {
    return (
        <OPNetProvider>
            <WalletProvider>
                <TxHistoryProvider>
                    <HashRouter>
                        <Header />
                        <main>
                            <Suspense fallback={<PageLoader />}>
                                <Routes>
                                    <Route path="/" element={<GamePage />} />
                                    <Route path="/history" element={<HistoryPage />} />
                                    <Route path="/staking" element={<StakingPage />} />
                                    <Route path="/dashboard" element={<DashboardPage />} />
                                </Routes>
                            </Suspense>
                        </main>
                        <Footer />
                    </HashRouter>
                </TxHistoryProvider>
            </WalletProvider>
        </OPNetProvider>
    );
}
