/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_INDEXER_URL: string;
    readonly VITE_RELAYER_URL: string;
    readonly VITE_EVM_RPC: string;
    readonly VITE_REGISTRY_ADDRESS: string;
    readonly VITE_VOTING_BOOTH_ADDRESS: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

interface Window {
    ethereum?: {
        isMetaMask?: boolean;
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
        on: (event: string, handler: (...args: unknown[]) => void) => void;
        removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
}
