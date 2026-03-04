import { Link, useLocation } from 'react-router-dom';
import WalletConnect from './WalletConnect';

interface LayoutProps {
    children: React.ReactNode;
    account: string | null;
    isConnecting: boolean;
    isWrongChain: boolean;
    isRegistered: boolean;
    onConnect: () => Promise<void>;
    onDisconnect: () => void;
    onSwitchChain: () => Promise<void>;
}

export default function Layout({
    children,
    account,
    isConnecting,
    isWrongChain,
    isRegistered,
    onConnect,
    onDisconnect,
    onSwitchChain,
}: LayoutProps) {
    const location = useLocation();

    const isActive = (path: string) => location.pathname === path;

    return (
        <div className="layout">
            <header className="header">
                <div className="header-inner">
                    <Link to="/" className="logo">
                        <span className="logo-zk">zk</span>
                        <span className="logo-opengov">OpenGov</span>
                    </Link>

                    <nav className="nav">
                        <Link
                            to="/"
                            className={`nav-link ${isActive('/') ? 'nav-link-active' : ''}`}
                        >
                            About
                        </Link>
                        {isRegistered ? (
                            <Link
                                to="/proposals"
                                className={`nav-link ${isActive('/proposals') ? 'nav-link-active' : ''}`}
                            >
                                Proposals
                            </Link>
                        ) : (
                            <span className="nav-link nav-link-disabled" title="Complete registration first">
                                Proposals
                            </span>
                        )}
                        <Link
                            to="/register"
                            className={`nav-link ${isActive('/register') ? 'nav-link-active' : ''}`}
                        >
                            Register
                        </Link>
                    </nav>

                    <WalletConnect
                        account={account}
                        isConnecting={isConnecting}
                        onConnect={onConnect}
                        onDisconnect={onDisconnect}
                    />
                </div>
            </header>

            {isWrongChain && account && (
                <div className="chain-warning">
                    <span>You are connected to the wrong network.</span>
                    <button className="btn btn-sm btn-primary" onClick={onSwitchChain}>
                        Switch Network
                    </button>
                </div>
            )}

            <main className="main">{children}</main>

            <footer className="footer">
                <div className="footer-inner">
                    <span className="footer-brand">
                        <span className="logo-zk">zk</span>OpenGov
                    </span>
                    <span className="footer-sep">|</span>
                    <span>Private voting for Polkadot OpenGov</span>
                    <span className="footer-sep">|</span>
                    <span>Built with Groth16 ZK-SNARKs on pallet-revive</span>
                </div>
            </footer>
        </div>
    );
}
