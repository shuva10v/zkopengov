declare module 'circomlibjs' {
    export function buildPoseidon(): Promise<any>;
}

declare module 'snarkjs' {
    export const groth16: {
        fullProve(
            input: object,
            wasmFile: string,
            zkeyFile: string,
        ): Promise<{
            proof: {
                pi_a: string[];
                pi_b: string[][];
                pi_c: string[];
            };
            publicSignals: string[];
        }>;
        verify(
            vkey: unknown,
            publicSignals: string[],
            proof: unknown,
        ): Promise<boolean>;
    };
}
