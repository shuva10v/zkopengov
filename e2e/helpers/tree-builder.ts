/**
 * PoseidonMerkleTree for E2E tests.
 *
 * A fixed-depth Merkle tree using Poseidon hashing (via circomlibjs).
 * Empty leaves use a zero value, and each level's default is
 * Poseidon(zero_below, zero_below).
 *
 * This mirrors the implementations in indexer/ and client-lib/ but takes
 * the Poseidon instance and field as constructor arguments to avoid
 * singleton state issues during testing.
 */

export interface MerkleProof {
  /** Sibling hashes along the path from leaf to root */
  pathElements: bigint[];
  /** Direction at each level: 0 = leaf is on the left, 1 = leaf is on the right */
  pathIndices: number[];
}

export class PoseidonMerkleTree {
  public readonly depth: number;
  public leaves: bigint[];
  public zeroValues: bigint[];
  public layers: bigint[][];
  private poseidon: any;
  private F: any;
  private nextIndex: number;

  constructor(depth: number, poseidon: any, F: any) {
    if (depth < 1 || depth > 32) {
      throw new Error(`Tree depth must be between 1 and 32, got ${depth}`);
    }

    this.depth = depth;
    this.poseidon = poseidon;
    this.F = F;
    this.nextIndex = 0;
    this.leaves = [];

    // Precompute zero values for each level
    this.zeroValues = new Array(depth + 1);
    this.zeroValues[0] = 0n;
    for (let i = 1; i <= depth; i++) {
      this.zeroValues[i] = this.hash(
        this.zeroValues[i - 1],
        this.zeroValues[i - 1]
      );
    }

    // Initialize layers: each layer starts empty
    this.layers = new Array(depth + 1);
    for (let i = 0; i <= depth; i++) {
      this.layers[i] = [];
    }
  }

  /**
   * Hash two field elements using Poseidon.
   */
  private hash(left: bigint, right: bigint): bigint {
    const result = this.poseidon([left, right]);
    return BigInt(this.F.toString(result));
  }

  /**
   * Insert a leaf into the next available slot and update the path to root.
   * Returns the index at which the leaf was inserted.
   */
  insert(leaf: bigint): number {
    const capacity = 2 ** this.depth;
    if (this.nextIndex >= capacity) {
      throw new Error(
        `Tree is full: capacity ${capacity}, attempted insert at index ${this.nextIndex}`
      );
    }

    const index = this.nextIndex;
    this.nextIndex++;

    // Set the leaf
    this.layers[0][index] = leaf;
    this.leaves.push(leaf);

    // Update the path from the inserted leaf up to the root
    this.updatePath(index);

    return index;
  }

  /**
   * Recompute hashes along the path from a given leaf index to the root.
   */
  private updatePath(leafIndex: number): void {
    let currentIndex = leafIndex;

    for (let level = 0; level < this.depth; level++) {
      const parentIndex = Math.floor(currentIndex / 2);
      const isRight = currentIndex % 2;

      const leftChild = this.getNode(
        level,
        isRight === 1 ? currentIndex - 1 : currentIndex
      );
      const rightChild = this.getNode(
        level,
        isRight === 1 ? currentIndex : currentIndex + 1
      );

      this.layers[level + 1][parentIndex] = this.hash(leftChild, rightChild);

      currentIndex = parentIndex;
    }
  }

  /**
   * Get the value of a node at a given level and index, falling back to
   * the zero value for that level if the node has never been set.
   */
  private getNode(level: number, index: number): bigint {
    if (this.layers[level][index] !== undefined) {
      return this.layers[level][index];
    }
    return this.zeroValues[level];
  }

  /**
   * Return the current Merkle root.
   */
  getRoot(): bigint {
    if (this.layers[this.depth].length === 0) {
      return this.zeroValues[this.depth];
    }
    return this.layers[this.depth][0];
  }

  /**
   * Generate a Merkle inclusion proof for the leaf at the given index.
   */
  getProof(index: number): MerkleProof {
    if (index < 0 || index >= this.nextIndex) {
      throw new Error(
        `Index ${index} out of range [0, ${this.nextIndex - 1}]`
      );
    }

    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];

    let currentIndex = index;

    for (let level = 0; level < this.depth; level++) {
      const isRight = currentIndex % 2;
      const siblingIndex = isRight === 1 ? currentIndex - 1 : currentIndex + 1;

      pathIndices.push(isRight);
      pathElements.push(this.getNode(level, siblingIndex));

      currentIndex = Math.floor(currentIndex / 2);
    }

    return { pathElements, pathIndices };
  }

  /**
   * Verify a Merkle proof against the current root.
   */
  verifyProof(leaf: bigint, proof: MerkleProof): boolean {
    let currentHash = leaf;

    for (let i = 0; i < proof.pathElements.length; i++) {
      if (proof.pathIndices[i] === 0) {
        currentHash = this.hash(currentHash, proof.pathElements[i]);
      } else {
        currentHash = this.hash(proof.pathElements[i], currentHash);
      }
    }

    return currentHash === this.getRoot();
  }

  /**
   * Return the number of leaves that have been inserted.
   */
  getLeafCount(): number {
    return this.nextIndex;
  }
}
