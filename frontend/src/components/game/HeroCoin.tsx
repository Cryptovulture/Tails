import './HeroCoin.css';

export function HeroCoin() {
    return (
        <div className="hero-coin-wrapper">
            <div className="hero-coin-glow" />
            <div className="hero-coin-float">
                <div className="hero-coin">
                    <div className="coin-face coin-front">
                        <img className="moto-logo" src="/moto-logo.jpg" alt="MOTO" />
                    </div>
                    <div className="coin-face coin-back">
                        <img className="moto-logo" src="/tails.png" alt="TAILS" />
                    </div>
                </div>
            </div>
            <div className="hero-particle" style={{ '--orbit-radius': '90px', '--orbit-speed': '7s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '95px', '--orbit-speed': '9s', animationDelay: '-3s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '85px', '--orbit-speed': '11s', animationDelay: '-5s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '100px', '--orbit-speed': '8s', animationDelay: '-2s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '88px', '--orbit-speed': '10s', animationDelay: '-7s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '92px', '--orbit-speed': '12s', animationDelay: '-4s' } as React.CSSProperties} />
        </div>
    );
}
