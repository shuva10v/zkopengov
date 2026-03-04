import { Link } from 'react-router-dom';
import { hasSecret } from '../lib/secret-storage';

export default function Home() {
    const registered = hasSecret();

    return (
        <div className="page page-home">
            <div className="hero">
                <h1 className="hero-title">
                    Private Voting for Polkadot OpenGov
                </h1>
                <p className="hero-subtitle">
                    Cast your vote on governance referenda without revealing your identity
                    or preferences. Powered by Groth16 ZK-SNARKs, Poseidon Merkle trees,
                    and pallet-revive on Polkadot.
                </p>
                <div className="hero-features">
                    <div className="hero-feature">
                        <span className="hero-feature-icon">&#128274;</span>
                        <span className="hero-feature-text">
                            <strong>Private</strong> -- Your vote is never linked to your address
                        </span>
                    </div>
                    <div className="hero-feature">
                        <span className="hero-feature-icon">&#9989;</span>
                        <span className="hero-feature-text">
                            <strong>Verifiable</strong> -- ZK proofs guarantee vote validity
                        </span>
                    </div>
                    <div className="hero-feature">
                        <span className="hero-feature-icon">&#9878;</span>
                        <span className="hero-feature-text">
                            <strong>Fair</strong> -- Tier-weighted voting prevents plutocracy
                        </span>
                    </div>
                </div>

                <div className="hero-cta">
                    {registered ? (
                        <Link to="/proposals" className="btn btn-primary btn-lg">
                            View Proposals
                        </Link>
                    ) : (
                        <Link to="/register" className="btn btn-primary btn-lg">
                            Get Started — Register
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
