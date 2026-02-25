import './ProvablyFairModal.css';

interface ProvablyFairModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ProvablyFairModal({ isOpen, onClose }: ProvablyFairModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-card pf-modal" onClick={(e) => e.stopPropagation()}>
                <h2 className="pf-title">Provably Fair</h2>

                <div className="pf-section">
                    <h3>How It Works</h3>
                    <p>
                        The winner of each coin flip is determined by the Bitcoin block hash
                        at the time the bet is settled. This is a source of randomness that
                        no party can predict or manipulate.
                    </p>
                </div>

                <div className="pf-section">
                    <h3>Verification</h3>
                    <p>
                        Every bet outcome is recorded on-chain and can be independently verified.
                        The block hash used for randomness is publicly visible on the Bitcoin blockchain.
                    </p>
                </div>

                <div className="pf-section">
                    <h3>Smart Contract</h3>
                    <p>
                        The Tails contract runs on OPNet (Bitcoin L1). All funds are held
                        trustlessly by the smart contract — neither player nor the platform
                        can access locked funds.
                    </p>
                </div>

                <button className="modal-close-btn" onClick={onClose}>Got it</button>
            </div>
        </div>
    );
}
