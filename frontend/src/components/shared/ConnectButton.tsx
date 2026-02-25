import { useWallet } from '../../context/WalletContext';
import { shortenAddress } from '../../utils/format';
import './ConnectButton.css';

export function ConnectButton() {
    const { isConnected, p2trAddress, connect, disconnect } = useWallet();

    if (isConnected && p2trAddress) {
        return (
            <div className="connect-btn-group">
                <span className="wallet-address">{shortenAddress(p2trAddress)}</span>
                <button className="btn btn-disconnect" onClick={disconnect}>
                    Disconnect
                </button>
            </div>
        );
    }

    return (
        <button className="btn btn-connect" onClick={connect}>
            Connect Wallet
        </button>
    );
}
