import { useState, useCallback, useEffect } from 'react';
import { useTails } from '../hooks/useTails';
import { useWallet } from '../context/WalletContext';
import { HeroCoin } from '../components/game/HeroCoin';
import { TierSelector, getSelectedMoto } from '../components/game/TierSelector';
import { OpenBetsList } from '../components/game/OpenBetsList';
import { ProvablyFairModal } from '../components/game/ProvablyFairModal';
import { BetResultModal } from '../components/game/BetResultModal';
import { TxToast } from '../components/shared/TxToast';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import './GamePage.css';

function formatAmount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
    return n.toString();
}

export function GamePage() {
    const { isConnected, address, signer, p2trAddress } = useWallet();
    const {
        stats, openBets, loading, initialLoading, error, status, lastTxId, clearError,
        createBet, acceptBet, cancelBet,
    } = useTails();

    const [selectedTier, setSelectedTier] = useState<number | null>(null);
    const [quantity, setQuantity] = useState(0);
    const [txId, setTxId] = useState<string | null>(null);
    const [showFairModal, setShowFairModal] = useState(false);
    const [betResult, setBetResult] = useState<{ amount: number } | null>(null);

    // Surface approval TX IDs from the hook (ensureAllowance)
    useEffect(() => {
        if (lastTxId) setTxId(lastTxId);
    }, [lastTxId]);

    const walletBigInt = address && typeof (address as { toBigInt?: () => bigint }).toBigInt === 'function'
        ? (address as { toBigInt: () => bigint }).toBigInt()
        : null;

    const totalMoto = getSelectedMoto(selectedTier, quantity);
    const hasBet = selectedTier !== null && quantity > 0;

    const handleCreateBet = useCallback(async () => {
        if (selectedTier === null || quantity <= 0) return;
        let resultTxId: string | null = null;
        for (let i = 0; i < quantity; i++) {
            const result = await createBet(selectedTier);
            if (result) {
                resultTxId = result;
            } else {
                break;
            }
        }
        if (resultTxId) {
            setTxId(resultTxId);
            setBetResult({ amount: totalMoto });
            setSelectedTier(null);
            setQuantity(0);
        }
    }, [selectedTier, quantity, totalMoto, createBet]);

    const handleAcceptBet = useCallback(async (betId: bigint) => {
        const result = await acceptBet(betId);
        if (result) {
            setTxId(result);
        }
    }, [acceptBet]);

    const handleCancelBet = useCallback(async (betId: bigint) => {
        const result = await cancelBet(betId);
        if (result) {
            setTxId(result);
        }
    }, [cancelBet]);

    return (
        <div className="game-page">
            <HeroCoin />

            <div className="page-header">
                <h1 className="page-title-gradient">Tails</h1>
                <p className="page-subtitle">50/50 provably fair. Pick a tier. Flip a coin.</p>
                <button className="provably-fair-link" onClick={() => setShowFairModal(true)}>
                    Provably Fair
                </button>
            </div>

            {status && (
                <div className="status-banner">
                    <LoadingSpinner size={16} />
                    <span>{status}</span>
                </div>
            )}

            {error && (
                <div className="error-banner">
                    {error}
                    <button className="error-dismiss" onClick={clearError}>x</button>
                </div>
            )}

            <TierSelector
                selectedTier={selectedTier}
                quantity={quantity}
                onSelect={setSelectedTier}
                onQuantityChange={setQuantity}
                disabled={loading}
            />

            {hasBet && isConnected && (
                <div className="create-bet-section">
                    <div className="create-bet-left">
                        <div className="create-bet-info">
                            {quantity === 1 ? (
                                <>
                                    <span>1 Bet:</span>
                                    <span className="create-bet-amount">{formatAmount(totalMoto)} MOTO</span>
                                </>
                            ) : (
                                <>
                                    <span>{quantity} Bets:</span>
                                    <span className="create-bet-amount">{formatAmount(totalMoto)} MOTO</span>
                                </>
                            )}
                        </div>
                    </div>
                    <button
                        className="btn btn-create-bet"
                        onClick={handleCreateBet}
                        disabled={loading}
                    >
                        {loading ? <LoadingSpinner size={18} /> : quantity > 1 ? `Create ${quantity} Bets` : 'Create Bet'}
                    </button>
                </div>
            )}

            {!isConnected && (
                <div className="connect-prompt">
                    Connect your wallet to create or accept bets
                </div>
            )}

            {isConnected && (
                <div style={{ fontSize: '0.7rem', color: '#888', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', fontFamily: 'monospace' }}>
                    Wallet: {p2trAddress ? `${p2trAddress.slice(0, 12)}...` : 'none'} | Address (MLDSA): {address ? 'OK' : 'NULL'} | Signer: {signer ? 'OK' : 'NULL'}
                </div>
            )}

            {initialLoading ? (
                <div className="initial-loading">
                    <LoadingSpinner size={32} />
                    <span>Loading bets...</span>
                </div>
            ) : (
                <OpenBetsList
                    bets={openBets}
                    walletAddressBigInt={walletBigInt}
                    onAccept={handleAcceptBet}
                    onCancel={handleCancelBet}
                    loading={loading}
                    isConnected={isConnected}
                />
            )}

            {stats && (
                <div className="game-stats-bar">
                    <span>Total Bets: <strong>{stats.totalBets.toString()}</strong></span>
                    <span>Open: <strong>{openBets.length}</strong></span>
                </div>
            )}

            <TxToast txId={txId} onClose={() => setTxId(null)} />
            <ProvablyFairModal isOpen={showFairModal} onClose={() => setShowFairModal(false)} />
            <BetResultModal
                isOpen={betResult !== null}
                onClose={() => setBetResult(null)}
                won={null}
                amount={betResult?.amount ?? 0}
            />
        </div>
    );
}
