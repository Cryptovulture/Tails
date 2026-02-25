import { useState, useEffect, useRef } from 'react';
import { EXPLORER_URL } from '../../config/contracts';
import './TxToast.css';

interface TxToastProps {
    txId: string | null;
    onClose: () => void;
}

export function TxToast({ txId, onClose }: TxToastProps) {
    const [visible, setVisible] = useState(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (txId) {
            setVisible(true);
            const timer = setTimeout(() => {
                setVisible(false);
                setTimeout(() => onCloseRef.current(), 300);
            }, 8000);
            return () => clearTimeout(timer);
        }
    }, [txId]);

    if (!txId) return null;

    const explorerLink = `${EXPLORER_URL}/tx/${txId}`;

    return (
        <div className={`tx-toast ${visible ? 'visible' : ''}`}>
            <span className="tx-toast-label">TX Sent</span>
            <a
                className="tx-toast-link"
                href={explorerLink}
                target="_blank"
                rel="noopener noreferrer"
            >
                {txId.slice(0, 12)}...
            </a>
        </div>
    );
}
