interface WalletConnectProps {
    account: string | null;
    isConnecting: boolean;
    onConnect: () => Promise<void>;
    onDisconnect: () => void;
}

/**
 * Truncate an address for display: 0x1234...abcd
 */
function truncateAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WalletConnect({
    account,
    isConnecting,
    onConnect,
    onDisconnect,
}: WalletConnectProps) {
    if (account) {
        return (
            <div className="wallet-connected">
                <span className="wallet-indicator" />
                <span className="wallet-address">{truncateAddress(account)}</span>
                <button
                    className="btn btn-sm btn-outline"
                    onClick={onDisconnect}
                >
                    Disconnect
                </button>
            </div>
        );
    }

    return (
        <button
            className="btn btn-primary"
            onClick={onConnect}
            disabled={isConnecting}
        >
            {isConnecting ? (
                <>
                    <span className="spinner spinner-sm" />
                    Connecting...
                </>
            ) : (
                'Connect Wallet'
            )}
        </button>
    );
}
