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
                        <Link
                            to="/stats"
                            className={`nav-link ${isActive('/stats') ? 'nav-link-active' : ''}`}
                        >
                            Stats
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
                    <span className="footer-sep">|</span>
                    <a href="https://github.com/shuva10v/zkopengov" target="_blank" rel="noopener noreferrer" className="github-badge">
                        <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                        </svg>
                        <span>GitHub</span>
                    </a>
                </div>
            </footer>
        </div>
    );
}
