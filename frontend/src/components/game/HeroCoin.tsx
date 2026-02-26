import './HeroCoin.css';

export function HeroCoin() {
    return (
        <div className="hero-coin-wrapper">
            <div className="hero-coin-glow" />

            <div className="hero-coin-float">
                <div className="hero-coin-perspective">
                    <div className="hero-coin">
                        <div className="coin-face coin-front">
                            <img className="coin-logo" src="/moto-logo.jpg" alt="MOTO" />
                        </div>
                        <div className="coin-face coin-back">
                            <img className="coin-logo" src="/tails.png" alt="TAILS" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="hero-particle" style={{ '--orbit-radius': '100px', '--orbit-speed': '8s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '105px', '--orbit-speed': '11s', animationDelay: '-3s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '95px', '--orbit-speed': '13s', animationDelay: '-6s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '110px', '--orbit-speed': '9s', animationDelay: '-2s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '98px', '--orbit-speed': '12s', animationDelay: '-8s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '103px', '--orbit-speed': '14s', animationDelay: '-5s' } as React.CSSProperties} />
        </div>
    );
}
