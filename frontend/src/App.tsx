import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { usePolkadotWallet } from './hooks/usePolkadotWallet';
import { hasSecret } from './lib/secret-storage';
import Layout from './components/Layout';
import Home from './pages/Home';
import Proposals from './pages/Proposals';
import Register from './pages/Register';
import Vote from './pages/Vote';
import Results from './pages/Results';
import Stats from './pages/Stats';

export default function App() {
    const wallet = usePolkadotWallet();
    const isRegistered = wallet.isConnected && hasSecret();

    return (
        <BrowserRouter>
            <Layout
                account={wallet.account}
                isConnecting={wallet.isConnecting}
                isWrongChain={wallet.isWrongChain}
                isRegistered={isRegistered}
                onConnect={wallet.connect}
                onDisconnect={wallet.disconnect}
                onSwitchChain={wallet.switchChain}
            >
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/proposals" element={<Proposals />} />
                    <Route
                        path="/register"
                        element={
                            <Register
                                account={wallet.account}
                                isConnected={wallet.isConnected}
                                onConnect={wallet.connect}
                            />
                        }
                    />
                    <Route
                        path="/vote/:id"
                        element={
                            <Vote
                                account={wallet.account}
                                isConnected={wallet.isConnected}
                            />
                        }
                    />
                    <Route path="/results/:id" element={<Results />} />
                    <Route path="/stats" element={<Stats />} />
                </Routes>
            </Layout>
        </BrowserRouter>
    );
}
