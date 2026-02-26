import './HeroCoin.css';

export function HeroCoin() {
    // Generate band layers from -9px to +9px to fill the gap between faces
    const bandLayers = [];
    for (let z = -9; z <= 9; z += 1) {
        bandLayers.push(
            <div key={z} className="coin-band" style={{ transform: `translateZ(${z}px)` }} />
        );
    }

    return (
        <div className="hero-coin-wrapper">
            <div className="hero-coin-glow" />

            <div className="hero-coin-float">
                <div className="hero-coin-perspective">
                    <div className="hero-coin">
                        <div className="coin-face coin-front">
                            <img className="coin-logo" src="/moto-logo.jpg" alt="MOTO" />
                        </div>
                        {bandLayers}
                        <div className="coin-face coin-back">
                            <img className="coin-logo" src="/tails.png" alt="TAILS" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="hero-particle" style={{ '--orbit-radius': '105px', '--orbit-speed': '8s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '110px', '--orbit-speed': '11s', animationDelay: '-3s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '100px', '--orbit-speed': '13s', animationDelay: '-6s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '115px', '--orbit-speed': '9s', animationDelay: '-2s' } as React.CSSProperties} />
        </div>
    );
}
