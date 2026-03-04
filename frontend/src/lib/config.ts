export const config = {
    indexerUrl: import.meta.env.VITE_INDEXER_URL || 'http://localhost:3001',
    relayerUrl: import.meta.env.VITE_RELAYER_URL || 'http://localhost:3002',
    evmRpc: import.meta.env.VITE_EVM_RPC || 'http://localhost:8545',
    registryAddress: import.meta.env.VITE_REGISTRY_ADDRESS || '',
    votingBoothAddress: import.meta.env.VITE_VOTING_BOOTH_ADDRESS || '',
    s3Url: import.meta.env.VITE_S3_URL || 'https://zkopengov-polkadot.s3.us-west-2.amazonaws.com',
    /** Expected chain ID. Defaults to Polkadot Hub Testnet (420420417). */
    chainId: Number(import.meta.env.VITE_CHAIN_ID || '420420417'),
};

/** Known Polkadot EVM network definitions for wallet_addEthereumChain. */
export const CHAIN_CONFIGS: Record<number, {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls?: string[];
}> = {
    420420419: {
        chainId: '0x' + (420420419).toString(16),
        chainName: 'Polkadot Hub',
        rpcUrls: ['https://eth-rpc.polkadot.io/'],
        nativeCurrency: { name: 'DOT', symbol: 'DOT', decimals: 18 },
        blockExplorerUrls: ['https://blockscout.polkadot.io/'],
    },
    420420417: {
        chainId: '0x' + (420420417).toString(16),
        chainName: 'Polkadot Hub Testnet',
        rpcUrls: ['https://eth-rpc-testnet.polkadot.io/'],
        nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
        blockExplorerUrls: ['https://blockscout-testnet.polkadot.io/'],
    },
};
