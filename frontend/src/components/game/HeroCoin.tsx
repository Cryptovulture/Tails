import './HeroCoin.css';

export function HeroCoin() {
    // Edge layers fill the gap so you can't see through
    const edgeLayers = Array.from({ length: 40 }, (_, i) => i);

    return (
        <div className="hero-coin-wrapper">
            <div className="hero-coin-glow" />

            <div className="hero-coin-float">
                <div className="hero-coin-perspective">
                    <div className="hero-coin">
                        {/* Solid edge fill — no gaps */}
                        {edgeLayers.map((i) => (
                            <div
                                key={i}
                                className="coin-edge-layer"
                                style={{ transform: `translateZ(${-8 + i * 0.4}px)` }}
                            />
                        ))}

                        {/* Front face */}
                        <div className="coin-face coin-front">
                            <img className="coin-logo" src="/moto-logo.jpg" alt="MOTO" />
                        </div>

                        {/* Back face */}
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
            <div className="hero-particle" style={{ '--orbit-radius': '102px', '--orbit-speed': '12s', animationDelay: '-8s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '108px', '--orbit-speed': '14s', animationDelay: '-5s' } as React.CSSProperties} />
        </div>
    );
}
