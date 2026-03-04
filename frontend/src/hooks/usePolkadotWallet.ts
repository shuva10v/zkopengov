/**
 * Hook for wallet connection.
 *
 * Connects via MetaMask / window.ethereum for pallet-revive EVM compatibility.
 * Checks the connected chain matches the expected Polkadot network and prompts
 * to switch if needed.
 */

import { useState, useCallback, useEffect } from 'react';
import { config, CHAIN_CONFIGS } from '../lib/config';

export interface WalletState {
    /** Connected EVM account address (checksummed) */
    account: string | null;
    /** Whether a wallet is currently connected */
    isConnected: boolean;
    /** Whether a connection attempt is in progress */
    isConnecting: boolean;
    /** Whether the wallet is on the wrong chain */
    isWrongChain: boolean;
    /** Last error message, if any */
    error: string | null;
    /** Connect to the wallet */
    connect: () => Promise<void>;
    /** Disconnect the wallet */
    disconnect: () => void;
    /** Switch to the correct chain */
    switchChain: () => Promise<void>;
}

const expectedChainHex = '0x' + config.chainId.toString(16);

async function checkChain(): Promise<boolean> {
    if (!window.ethereum) return false;
    const chainId = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
    return chainId === expectedChainHex;
}

async function requestSwitchChain(): Promise<void> {
    if (!window.ethereum) throw new Error('No wallet detected');

    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: expectedChainHex }],
        });
    } catch (switchError: any) {
        // 4902 = chain not added to wallet yet
        if (switchError?.code === 4902) {
            const chainConfig = CHAIN_CONFIGS[config.chainId];
            if (!chainConfig) {
                throw new Error(
                    `Chain ${config.chainId} is not configured. Add it manually in MetaMask.`
                );
            }
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [chainConfig],
            });
        } else {
            throw switchError;
        }
    }
}

export function usePolkadotWallet(): WalletState {
    const [account, setAccount] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isWrongChain, setIsWrongChain] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const verifyChain = useCallback(async () => {
        const correct = await checkChain();
        setIsWrongChain(!correct);
        return correct;
    }, []);

    const connect = useCallback(async () => {
        setIsConnecting(true);
        setError(null);

        try {
            if (!window.ethereum) {
                throw new Error(
                    'No Ethereum wallet detected. Please install MetaMask to interact with zkOpenGov.'
                );
            }

            const accounts = (await window.ethereum.request({
                method: 'eth_requestAccounts',
            })) as string[];

            if (accounts.length === 0) {
                throw new Error('No accounts returned from wallet.');
            }

            setAccount(accounts[0]);

            // Check chain after connecting
            const correct = await checkChain();
            setIsWrongChain(!correct);

            if (!correct) {
                // Auto-prompt to switch
                try {
                    await requestSwitchChain();
                    setIsWrongChain(false);
                } catch {
                    // User declined — leave the warning visible
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to connect wallet';
            setError(message);
            setAccount(null);
        } finally {
            setIsConnecting(false);
        }
    }, []);

    const switchChain = useCallback(async () => {
        setError(null);
        try {
            await requestSwitchChain();
            setIsWrongChain(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to switch network';
            setError(message);
        }
    }, []);

    const disconnect = useCallback(() => {
        setAccount(null);
        setError(null);
        setIsWrongChain(false);
    }, []);

    // Listen for account and chain changes
    useEffect(() => {
        if (!window.ethereum) return;

        const handleAccountsChanged = (...args: unknown[]) => {
            const accounts = args[0] as string[];
            if (accounts.length === 0) {
                setAccount(null);
            } else {
                setAccount(accounts[0]);
            }
        };

        const handleChainChanged = () => {
            verifyChain();
        };

        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);

        return () => {
            window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
            window.ethereum?.removeListener('chainChanged', handleChainChanged);
        };
    }, [verifyChain]);

    // Try to reconnect on mount if previously connected
    useEffect(() => {
        if (!window.ethereum) return;

        (async () => {
            try {
                const accounts = (await window.ethereum!.request({
                    method: 'eth_accounts',
                })) as string[];
                if (accounts.length > 0) {
                    setAccount(accounts[0]);
                    await verifyChain();
                }
            } catch {
                // Silently fail -- user hasn't connected yet
            }
        })();
    }, [verifyChain]);

    return {
        account,
        isConnected: account !== null,
        isConnecting,
        isWrongChain,
        error,
        connect,
        disconnect,
        switchChain,
    };
}
