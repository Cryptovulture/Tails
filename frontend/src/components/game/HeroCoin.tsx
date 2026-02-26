import './HeroCoin.css';

export function HeroCoin() {
    // Edge slices create the 3D chip thickness
    const edgeSlices = Array.from({ length: 12 }, (_, i) => i);
    // Ridges around the chip rim
    const ridges = Array.from({ length: 40 }, (_, i) => i);

    return (
        <div className="hero-chip-wrapper">
            {/* Ambient glow */}
            <div className="hero-chip-glow" />
            <div className="hero-chip-glow-pulse" />

            {/* Float + spin container */}
            <div className="hero-chip-float">
                <div className="hero-chip-scene">
                    <div className="hero-chip">
                        {/* Chip edge (thickness) */}
                        <div className="chip-3d-edge">
                            {edgeSlices.map((i) => (
                                <div
                                    key={i}
                                    className="edge-slice"
                                    style={{
                                        transform: `rotateY(${i * 0.5}deg) translateZ(0.5px)`,
                                    }}
                                />
                            ))}
                        </div>

                        {/* Front face */}
                        <div className="chip-3d-face chip-3d-front">
                            <div className="chip-3d-rim">
                                {ridges.map((i) => (
                                    <span
                                        key={i}
                                        className="rim-ridge"
                                        style={{ transform: `rotate(${i * 9}deg)` }}
                                    />
                                ))}
                            </div>
                            <div className="chip-3d-inner-ring" />
                            <div className="chip-3d-inlay">
                                <img className="chip-3d-logo" src="/moto-logo.jpg" alt="MOTO" />
                            </div>
                        </div>

                        {/* Back face */}
                        <div className="chip-3d-face chip-3d-back">
                            <div className="chip-3d-rim">
                                {ridges.map((i) => (
                                    <span
                                        key={i}
                                        className="rim-ridge"
                                        style={{ transform: `rotate(${i * 9}deg)` }}
                                    />
                                ))}
                            </div>
                            <div className="chip-3d-inner-ring" />
                            <div className="chip-3d-inlay">
                                <img className="chip-3d-logo" src="/tails.png" alt="TAILS" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Orbiting particles */}
            <div className="hero-particle" style={{ '--orbit-radius': '100px', '--orbit-speed': '8s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '105px', '--orbit-speed': '11s', animationDelay: '-3s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '95px', '--orbit-speed': '13s', animationDelay: '-6s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '110px', '--orbit-speed': '9s', animationDelay: '-2s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '98px', '--orbit-speed': '12s', animationDelay: '-8s' } as React.CSSProperties} />
            <div className="hero-particle" style={{ '--orbit-radius': '103px', '--orbit-speed': '14s', animationDelay: '-5s' } as React.CSSProperties} />
        </div>
    );
}
