import { useState } from 'react';
import { useStaking } from '../hooks/useStaking';
import { useToken } from '../hooks/useToken';
import { useWallet } from '../context/WalletContext';
import { useOPNet } from '../context/OPNetContext';
import { StakePanel } from '../components/staking/StakePanel';
import { RewardsPanel } from '../components/staking/RewardsPanel';
import { StatsCard } from '../components/dashboard/StatsCard';
import { TxToast } from '../components/shared/TxToast';
import { FLIP_TOKEN_ADDRESS, STAKING_ADDRESS } from '../config/contracts';
import { formatFlip, formatMoto } from '../utils/format';
import { getContract } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import './StakingPage.css';

export function StakingPage() {
    const { isConnected, address } = useWallet();
    const { provider, network } = useOPNet();
    const { stakeInfo, poolStats, loading, error, clearError, stake, unstake, claimRewards } = useStaking();
    const { balance: flipBalance, approve } = useToken(FLIP_TOKEN_ADDRESS);
    const [txId, setTxId] = useState<string | null>(null);
    const [approving, setApproving] = useState(false);

    const handleStake = async (amount: bigint) => {
        if (!STAKING_ADDRESS || !address) return null;
        setApproving(true);
        try {
            // Build staking contract Address for approval
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stakingAddr = getContract(
                STAKING_ADDRESS,
                [],
                provider as any,
                network,
                address as Address,
            );
            const spenderAddress = stakingAddr.address;
            const approveTx = await approve(spenderAddress, amount);
            if (!approveTx) {
                setApproving(false);
                return null;
            }
        } catch (err) {
            console.error('[approval]', err);
            setApproving(false);
            return null;
        }
        setApproving(false);

        const result = await stake(amount);
        if (result) setTxId(result);
        return result;
    };

    const handleUnstake = async (amount: bigint) => {
        const result = await unstake(amount);
        if (result) setTxId(result);
        return result;
    };

    const handleClaim = async () => {
        const result = await claimRewards();
        if (result) setTxId(result);
        return result;
    };

    const isLoading = loading || approving;

    return (
        <div className="staking-page">
            <div className="page-header">
                <h1 className="page-title-gradient">FLIP Staking</h1>
                <p className="page-subtitle">Stake FLIP tokens to earn MOTO rewards from protocol fees</p>
            </div>

            {error && (
                <div className="error-banner">
                    {error}
                    <button className="error-dismiss" onClick={clearError}>x</button>
                </div>
            )}

            {poolStats && (
                <div className="pool-stats-grid">
                    <StatsCard
                        label="Total Staked"
                        value={formatFlip(poolStats.totalStaked)}
                        sub="FLIP"
                        accent="green"
                    />
                    <StatsCard
                        label="Total Distributed"
                        value={formatMoto(poolStats.totalDistributed)}
                        sub="MOTO"
                        accent="gold"
                    />
                </div>
            )}

            {isConnected ? (
                <div className="staking-panels">
                    <StakePanel
                        stakedBalance={stakeInfo?.stakedBalance ?? 0n}
                        flipBalance={flipBalance}
                        onStake={handleStake}
                        onUnstake={handleUnstake}
                        loading={isLoading}
                    />
                    <RewardsPanel
                        pendingRewards={stakeInfo?.pendingRewards ?? 0n}
                        onClaim={handleClaim}
                        loading={isLoading}
                    />
                </div>
            ) : (
                <div className="connect-prompt">
                    Connect your wallet to stake FLIP and earn rewards
                </div>
            )}

            <TxToast txId={txId} onClose={() => setTxId(null)} />
        </div>
    );
}
