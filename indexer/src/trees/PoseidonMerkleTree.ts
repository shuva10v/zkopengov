/**
 * Incremental Poseidon Merkle Tree.
 *
 * Uses circomlibjs for Poseidon hashing so that every hash produced here
 * is identical to the one computed inside a circom circuit.
 *
 * Tree layout:
 *   layers[0] = leaves
 *   layers[depth] = [root]
 *
 * Zero values are the default hashes at each level when no real leaf has
 * been inserted:
 *   zeroValues[0] = 0n
 *   zeroValues[i] = poseidon([zeroValues[i-1], zeroValues[i-1]])
 */

export interface MerkleProof {
  /** Sibling hashes along the path from leaf to root */
  pathElements: bigint[];
  /** Direction at each level: 0 = leaf is on the left, 1 = leaf is on the right */
  pathIndices: number[];
}

export interface PoseidonMerkleTreeJSON {
  depth: number;
  leaves: string[];
  nextIndex: number;
}

export class PoseidonMerkleTree {
  public readonly depth: number;
  public leaves: bigint[];
  public zeroValues: bigint[];
  public layers: bigint[][];
  public poseidon: any;
  public F: any;
  private nextIndex: number;

  constructor(depth: number, poseidon: any) {
    if (depth < 1 || depth > 32) {
      throw new Error(`Tree depth must be between 1 and 32, got ${depth}`);
    }

    this.depth = depth;
    this.poseidon = poseidon;
    this.F = poseidon.F;
    this.nextIndex = 0;
    this.leaves = [];

    // Precompute zero values for each level
    this.zeroValues = new Array(depth + 1);
    this.zeroValues[0] = 0n;
    for (let i = 1; i <= depth; i++) {
      this.zeroValues[i] = this.hash(this.zeroValues[i - 1], this.zeroValues[i - 1]);
    }

    // Initialize layers: each layer starts empty — we use zeroValues as defaults
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

      const leftChild = this.getNode(level, isRight === 1 ? currentIndex - 1 : currentIndex);
      const rightChild = this.getNode(level, isRight === 1 ? currentIndex : currentIndex + 1);

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

  /**
   * Bulk-insert an array of leaves and build the tree bottom-up.
   * Much faster than repeated insert() — O(N) hashes instead of O(N * depth).
   */
  bulkInsert(newLeaves: bigint[]): void {
    const capacity = 2 ** this.depth;
    if (this.nextIndex + newLeaves.length > capacity) {
      throw new Error(
        `Tree overflow: capacity ${capacity}, have ${this.nextIndex}, inserting ${newLeaves.length}`
      );
    }

    // Place all leaves at level 0
    for (let i = 0; i < newLeaves.length; i++) {
      const idx = this.nextIndex + i;
      this.layers[0][idx] = newLeaves[i];
      this.leaves.push(newLeaves[i]);
    }

    const startIdx = this.nextIndex;
    this.nextIndex += newLeaves.length;

    // Rebuild internal levels bottom-up
    let levelStart = Math.floor(startIdx / 2);
    let levelEnd = Math.floor((this.nextIndex - 1) / 2);

    for (let level = 0; level < this.depth; level++) {
      for (let i = levelStart; i <= levelEnd; i++) {
        const left = this.getNode(level, i * 2);
        const right = this.getNode(level, i * 2 + 1);
        this.layers[level + 1][i] = this.hash(left, right);
      }
      levelStart = Math.floor(levelStart / 2);
      levelEnd = Math.floor(levelEnd / 2);
    }
  }

  /**
   * Serialize the tree to a plain JSON-compatible object.
   * We only store leaves + depth; the full tree can be rebuilt.
   */
  toJSON(): PoseidonMerkleTreeJSON {
    return {
      depth: this.depth,
      leaves: this.leaves.map((l) => l.toString()),
      nextIndex: this.nextIndex,
    };
  }

  /**
   * Reconstruct a PoseidonMerkleTree from its serialized form.
   */
  static fromJSON(data: PoseidonMerkleTreeJSON, poseidon: any): PoseidonMerkleTree {
    const tree = new PoseidonMerkleTree(data.depth, poseidon);
    const leaves = data.leaves.map((s) => BigInt(s));
    tree.bulkInsert(leaves);
    return tree;
  }
}
