import { useEffect, useRef } from 'react';

export function usePolling(
    callback: () => Promise<void>,
    intervalMs: number,
    enabled: boolean = true,
) {
    const savedCallback = useRef(callback);
    savedCallback.current = callback;

    useEffect(() => {
        if (!enabled) return;
        savedCallback.current().catch((err) => console.error('[polling]', err));
        const id = setInterval(() => {
            savedCallback.current().catch((err) => console.error('[polling]', err));
        }, intervalMs);
        return () => clearInterval(id);
    }, [intervalMs, enabled]);
}
