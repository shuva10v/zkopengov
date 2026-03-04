/**
 * Poseidon Merkle tree implementation for local tree rebuilding.
 *
 * This module rebuilds the Merkle tree entirely in the browser from the
 * leaf data downloaded from the indexer. This ensures that the user's
 * Merkle proof is computed locally without revealing which leaf belongs
 * to the user.
 */

import { poseidonHash } from './poseidon';
import { MerkleProofData } from './types';

/** Default tree depth matching the compiled circuit artifacts (depth 20 ≈ 1M leaves) */
const DEFAULT_TREE_DEPTH = 20;

/**
 * Poseidon-based Merkle tree with fixed depth and zero-value padding.
 *
 * Empty leaves are represented by a zero value (0n). Each level's "zero"
 * is computed as Poseidon(zero_below, zero_below), forming a deterministic
 * chain of zero hashes.
 */
export class PoseidonMerkleTree {
    private depth: number;
    private leaves: bigint[];
    private layers: bigint[][];
    private zeroValues: bigint[];

    /**
     * Create a new empty PoseidonMerkleTree.
     *
     * @param depth - Depth of the tree (number of levels below the root)
     */
    constructor(depth: number = DEFAULT_TREE_DEPTH) {
        this.depth = depth;
        this.leaves = [];
        this.layers = [];

        // Precompute zero values for each level.
        // zeroValues[0] = 0 (empty leaf)
        // zeroValues[i] = Poseidon(zeroValues[i-1], zeroValues[i-1])
        this.zeroValues = new Array(depth + 1);
        this.zeroValues[0] = 0n;
        for (let i = 1; i <= depth; i++) {
            this.zeroValues[i] = poseidonHash([this.zeroValues[i - 1], this.zeroValues[i - 1]]);
        }

        // Initialize layers with the zero root
        this._buildLayers();
    }

    /**
     * Insert a leaf at the next available position.
     *
     * @param leaf - The leaf value (field element)
     */
    insert(leaf: bigint): void {
        const maxLeaves = 1 << this.depth; // 2^depth
        if (this.leaves.length >= maxLeaves) {
            throw new Error(`Tree is full (max ${maxLeaves} leaves)`);
        }
        this.leaves.push(leaf);
        this._buildLayers();
    }

    /**
     * Get the current Merkle root.
     *
     * @returns The root hash as a bigint
     */
    getRoot(): bigint {
        return this.layers[this.depth][0];
    }

    /**
     * Get the Merkle proof for a leaf at the given index.
     *
     * @param index - The leaf index (0-based)
     * @returns The path elements and path indices
     * @throws If the index is out of range
     */
    getProof(index: number): MerkleProofData {
        if (index < 0 || index >= this.leaves.length) {
            throw new Error(
                `Leaf index ${index} out of range [0, ${this.leaves.length - 1}]`
            );
        }

        const pathElements: bigint[] = [];
        const pathIndices: number[] = [];

        let currentIndex = index;
        for (let level = 0; level < this.depth; level++) {
            // Determine the sibling index
            const isRight = currentIndex % 2;
            const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

            // Get sibling value (use zero value if beyond the layer size)
            const layer = this.layers[level];
            const sibling = siblingIndex < layer.length
                ? layer[siblingIndex]
                : this.zeroValues[level];

            pathElements.push(sibling);
            pathIndices.push(isRight);

            // Move up to parent
            currentIndex = Math.floor(currentIndex / 2);
        }

        return { pathElements, pathIndices };
    }

    /**
     * Get the number of inserted leaves.
     */
    getLeafCount(): number {
        return this.leaves.length;
    }

    /**
     * Build the tree from an array of leaves.
     *
     * @param leaves - Array of leaf values
     * @param depth - Tree depth
     * @returns A new PoseidonMerkleTree containing the given leaves
     */
    static fromLeaves(leaves: bigint[], depth: number = DEFAULT_TREE_DEPTH): PoseidonMerkleTree {
        const tree = new PoseidonMerkleTree(depth);
        const maxLeaves = 1 << depth;
        if (leaves.length > maxLeaves) {
            throw new Error(
                `Too many leaves (${leaves.length}) for tree depth ${depth} (max ${maxLeaves})`
            );
        }
        tree.leaves = [...leaves];
        tree._buildLayers();
        return tree;
    }

    /**
     * Rebuild all internal layers from the current leaves.
     */
    private _buildLayers(): void {
        this.layers = new Array(this.depth + 1);

        // Layer 0 = leaves (padded with zero values)
        this.layers[0] = [...this.leaves];

        // Build each subsequent layer by hashing pairs
        for (let level = 1; level <= this.depth; level++) {
            const prevLayer = this.layers[level - 1];
            const prevZero = this.zeroValues[level - 1];
            const layerSize = Math.ceil(prevLayer.length / 2);
            this.layers[level] = new Array(Math.max(layerSize, 1));

            for (let i = 0; i < layerSize; i++) {
                const left = prevLayer[2 * i] !== undefined ? prevLayer[2 * i] : prevZero;
                const right = prevLayer[2 * i + 1] !== undefined ? prevLayer[2 * i + 1] : prevZero;
                this.layers[level][i] = poseidonHash([left, right]);
            }

            // If the layer is empty (no leaves at all), use the zero value
            if (layerSize === 0) {
                this.layers[level] = [this.zeroValues[level]];
            }
        }
    }
}

/**
 * Build an ownership tree from raw leaf data.
 *
 * Each ownership leaf = Poseidon(address, commitment).
 *
 * @param leaves - Array of objects with address and commitment hex strings
 * @returns A PoseidonMerkleTree with the computed ownership leaves
 */
export function buildOwnershipTreeFromData(
    leaves: Array<{ address: string; commitment: string }>
): PoseidonMerkleTree {
    const leafValues = leaves.map((leaf) => {
        const address = BigInt('0x' + leaf.address.replace(/^0x/, ''));
        const commitment = BigInt('0x' + leaf.commitment.replace(/^0x/, ''));
        return poseidonHash([address, commitment]);
    });
    return PoseidonMerkleTree.fromLeaves(leafValues);
}

/**
 * Build a balances tree from raw leaf data.
 *
 * Each balances leaf = Poseidon(address, balance).
 *
 * @param leaves - Array of objects with address (hex) and balance (decimal string)
 * @returns A PoseidonMerkleTree with the computed balance leaves
 */
export function buildBalancesTreeFromData(
    leaves: Array<{ address: string; balance: string }>
): PoseidonMerkleTree {
    const leafValues = leaves.map((leaf) => {
        const address = BigInt('0x' + leaf.address.replace(/^0x/, ''));
        const balance = BigInt(leaf.balance);
        return poseidonHash([address, balance]);
    });
    return PoseidonMerkleTree.fromLeaves(leafValues);
}
