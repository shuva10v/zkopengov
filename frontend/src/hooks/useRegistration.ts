/**
 * Hook for the voter registration flow.
 *
 * Registration involves:
 * 1. Generating a random secret via client-lib
 * 2. Computing commitment = Poseidon(secret) via client-lib
 * 3. Submitting register(commitment) transaction to the VotingRegistry contract
 * 4. Storing the secret in localStorage
 * 5. Polling the contract until the ownership tree includes the registration
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { saveSecret, loadSecret, hasSecret, saveRegistrationIndex, loadRegistrationIndex } from '../lib/secret-storage';
import { config } from '../lib/config';
import { getRegistryContract } from '../lib/contracts';
import { generateRegistrationData } from 'zk-opengov-client-lib';

/** How often to poll for tree inclusion (ms) */
const POLL_INTERVAL = 10_000;

interface RegistrationState {
    /** Whether the current address is registered on-chain */
    isRegistered: boolean;
    /** Whether a registration transaction is in progress */
    isRegistering: boolean;
    /** Transaction hash of the registration tx */
    txHash: string | null;
    /** The user's secret (shown once after generation) */
    generatedSecret: string | null;
    /** Error message, if any */
    error: string | null;
    /** Whether the user has a stored secret locally */
    hasStoredSecret: boolean;
    /** The registration index assigned by the contract (-1 if not yet known) */
    registrationIndex: number;
    /** Whether the ownership tree on-chain includes this registration */
    isTreeReady: boolean;
    /** Whether we're currently polling for tree inclusion */
    isWaitingForTree: boolean;
    /** Check if the connected address is registered */
    checkRegistration: (address: string) => Promise<void>;
    /** Generate secret and register on-chain */
    register: () => Promise<void>;
}

const REGISTRY_ABI = [
    'function register(bytes32 commitment) external',
    'function isRegistered(address) view returns (bool)',
    'function latestOwnershipRegCount() view returns (uint256)',
    'function getRegistrationCount() view returns (uint256)',
    'function getRegistration(uint256 index) view returns (address account, bytes32 commitment)',
    'event Registered(uint256 indexed index, address indexed account, bytes32 commitment)',
];

export function useRegistration(account: string | null): RegistrationState {
    const [isRegistered, setIsRegistered] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasStoredSecret, setHasStoredSecret] = useState(hasSecret());
    const [registrationIndex, setRegistrationIndex] = useState(() => loadRegistrationIndex() ?? -1);
    const [isTreeReady, setIsTreeReady] = useState(false);
    const [isWaitingForTree, setIsWaitingForTree] = useState(() => loadRegistrationIndex() !== null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Clean up polling on unmount
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    /** Start polling the contract to check if the ownership tree includes our registration */
    const startTreePolling = useCallback((index: number) => {
        if (pollRef.current) clearInterval(pollRef.current);

        setIsWaitingForTree(true);
        setIsTreeReady(false);

        const checkTree = async () => {
            try {
                const registry = getRegistryContract();
                const regCount = await registry.latestOwnershipRegCount();
                const count = Number(regCount);
                console.log(
                    `[useRegistration] Polling tree: latestOwnershipRegCount=${count}, need > ${index}`
                );
                if (count > index) {
                    // Tree has been rebuilt to include our registration
                    setIsTreeReady(true);
                    setIsWaitingForTree(false);
                    if (pollRef.current) {
                        clearInterval(pollRef.current);
                        pollRef.current = null;
                    }
                }
            } catch (err) {
                console.warn('[useRegistration] Tree poll failed:', err);
            }
        };

        // Check immediately, then poll
        checkTree();
        pollRef.current = setInterval(checkTree, POLL_INTERVAL);
    }, []);

    const checkRegistration = useCallback(
        async (address: string) => {
            if (!config.registryAddress) {
                return;
            }

            try {
                const provider = new ethers.JsonRpcProvider(config.evmRpc);
                const registry = new ethers.Contract(
                    config.registryAddress,
                    REGISTRY_ABI,
                    provider
                );
                const registered = await registry.isRegistered(address);
                setIsRegistered(registered);

                // If registered but no stored index, look it up via contract view functions
                if (registered && loadRegistrationIndex() === null) {
                    try {
                        const count = Number(await registry.getRegistrationCount());
                        const addrLower = address.toLowerCase();
                        for (let i = 0; i < count; i++) {
                            const [regAccount] = await registry.getRegistration(i);
                            if (regAccount.toLowerCase() === addrLower) {
                                console.log(`[useRegistration] Found on-chain registration index: ${i}`);
                                saveRegistrationIndex(i);
                                setRegistrationIndex(i);
                                startTreePolling(i);
                                break;
                            }
                        }
                    } catch (err) {
                        console.warn('Failed to look up registration index:', err);
                    }
                }
            } catch (err) {
                console.error('Failed to check registration:', err);
            }
        },
        [startTreePolling]
    );

    const register = useCallback(async () => {
        setIsRegistering(true);
        setError(null);
        setTxHash(null);
        setGeneratedSecret(null);

        try {
            // Step 1 & 2: Generate secret + Poseidon commitment via client-lib
            const { secret, commitment } = await generateRegistrationData();

            // Step 3: Submit on-chain transaction
            if (!config.registryAddress) {
                throw new Error(
                    'Registry contract address not configured. Set VITE_REGISTRY_ADDRESS.'
                );
            }

            if (!window.ethereum) {
                throw new Error(
                    'No Ethereum wallet detected. Please install MetaMask.'
                );
            }

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const registry = new ethers.Contract(
                config.registryAddress,
                REGISTRY_ABI,
                signer
            );

            if (isRegistered) {
                throw new Error('This address is already registered. Each address can only register once.');
            }

            const tx = await registry.register(commitment);
            setTxHash(tx.hash);

            // Wait for confirmation and parse logs
            const receipt = await tx.wait();
            setIsRegistered(true);

            // Parse the Registered event to get the index
            const iface = new ethers.Interface(REGISTRY_ABI);
            let regIndex = -1;
            for (const log of receipt.logs) {
                try {
                    const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
                    if (parsed && parsed.name === 'Registered') {
                        regIndex = Number(parsed.args.index);
                        console.log(`[useRegistration] Registered with index: ${regIndex}`);
                        break;
                    }
                } catch {
                    // Skip logs from other contracts
                }
            }
            setRegistrationIndex(regIndex);

            // Step 4: Store secret + registration index
            saveSecret(secret);
            if (regIndex >= 0) {
                saveRegistrationIndex(regIndex);
            }
            setHasStoredSecret(true);
            setGeneratedSecret(secret.toString());

            // Step 5: Start polling for tree inclusion
            if (regIndex >= 0) {
                startTreePolling(regIndex);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Registration failed';
            setError(message);
        } finally {
            setIsRegistering(false);
        }
    }, [isRegistered, startTreePolling]);

    // Reset state and re-check when account changes
    useEffect(() => {
        setTxHash(null);
        setGeneratedSecret(null);
        setError(null);
        setIsTreeReady(false);
        setIsWaitingForTree(false);
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }

        if (account) {
            checkRegistration(account);
        } else {
            setIsRegistered(false);
        }
        setHasStoredSecret(hasSecret());
        setRegistrationIndex(loadRegistrationIndex() ?? -1);
    }, [account, checkRegistration]);

    // Check stored secret and registration index on mount
    useEffect(() => {
        const existingSecret = loadSecret();
        if (existingSecret) {
            setHasStoredSecret(true);
        }

        const storedIndex = loadRegistrationIndex();
        if (storedIndex !== null) {
            setRegistrationIndex(storedIndex);
            startTreePolling(storedIndex);
        }
    }, [startTreePolling]);

    return {
        isRegistered,
        isRegistering,
        txHash,
        generatedSecret,
        error,
        hasStoredSecret,
        registrationIndex,
        isTreeReady,
        isWaitingForTree,
        checkRegistration,
        register,
    };
}
