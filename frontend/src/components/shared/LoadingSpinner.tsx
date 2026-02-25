import './LoadingSpinner.css';

export function LoadingSpinner({ size = 24 }: { size?: number }) {
    const innerSize = Math.round(size * 0.6);
    return (
        <div className="spinner-wrap" style={{ width: size, height: size }}>
            <div
                className="spinner"
                style={{ width: size, height: size }}
            />
            <div
                className="spinner-inner"
                style={{ width: innerSize, height: innerSize }}
            />
        </div>
    );
}
