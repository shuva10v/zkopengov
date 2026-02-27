/**
 * PoseidonMerkleTree unit tests.
 *
 * Verifies correctness of the incremental Poseidon Merkle tree implementation
 * including insertion, root computation, proof generation/verification,
 * serialization, and compatibility with circomlibjs.
 */

// @ts-ignore — circomlibjs does not ship types
import { buildPoseidon } from "circomlibjs";
import { PoseidonMerkleTree } from "../src/trees/PoseidonMerkleTree";

let poseidon: any;
let F: any;

beforeAll(async () => {
  poseidon = await buildPoseidon();
  F = poseidon.F;
}, 30000);

function poseidonHash(left: bigint, right: bigint): bigint {
  const result = poseidon([left, right]);
  return BigInt(F.toString(result));
}

describe("PoseidonMerkleTree", () => {
  describe("initialization", () => {
    it("should initialize with correct depth and zero values", () => {
      const depth = 4;
      const tree = new PoseidonMerkleTree(depth, poseidon);

      expect(tree.depth).toBe(depth);
      expect(tree.zeroValues.length).toBe(depth + 1);
      expect(tree.zeroValues[0]).toBe(0n);

      // Each zero value should be poseidon(prev, prev)
      for (let i = 1; i <= depth; i++) {
        const expected = poseidonHash(tree.zeroValues[i - 1], tree.zeroValues[i - 1]);
        expect(tree.zeroValues[i]).toBe(expected);
      }
    });

    it("should have an empty root equal to zeroValues[depth]", () => {
      const depth = 4;
      const tree = new PoseidonMerkleTree(depth, poseidon);

      expect(tree.getRoot()).toBe(tree.zeroValues[depth]);
      expect(tree.getLeafCount()).toBe(0);
    });

    it("should throw for invalid depth", () => {
      expect(() => new PoseidonMerkleTree(0, poseidon)).toThrow();
      expect(() => new PoseidonMerkleTree(33, poseidon)).toThrow();
    });
  });

  describe("insert", () => {
    it("should insert leaves and update root", () => {
      const tree = new PoseidonMerkleTree(4, poseidon);
      const emptyRoot = tree.getRoot();

      tree.insert(42n);
      expect(tree.getLeafCount()).toBe(1);
      expect(tree.getRoot()).not.toBe(emptyRoot);

      const rootAfterFirst = tree.getRoot();
      tree.insert(123n);
      expect(tree.getLeafCount()).toBe(2);
      expect(tree.getRoot()).not.toBe(rootAfterFirst);
    });

    it("should return the correct insertion index", () => {
      const tree = new PoseidonMerkleTree(4, poseidon);

      expect(tree.insert(10n)).toBe(0);
      expect(tree.insert(20n)).toBe(1);
      expect(tree.insert(30n)).toBe(2);
    });

    it("should handle tree at capacity", () => {
      // depth = 2 means capacity = 4
      const tree = new PoseidonMerkleTree(2, poseidon);

      tree.insert(1n);
      tree.insert(2n);
      tree.insert(3n);
      tree.insert(4n);
      expect(tree.getLeafCount()).toBe(4);

      expect(() => tree.insert(5n)).toThrow(/full/i);
    });
  });

  describe("root consistency", () => {
    it("same leaves should produce the same root", () => {
      const leaves = [100n, 200n, 300n, 400n];

      const tree1 = new PoseidonMerkleTree(4, poseidon);
      const tree2 = new PoseidonMerkleTree(4, poseidon);

      for (const leaf of leaves) {
        tree1.insert(leaf);
        tree2.insert(leaf);
      }

      expect(tree1.getRoot()).toBe(tree2.getRoot());
    });

    it("different leaves should produce different roots", () => {
      const tree1 = new PoseidonMerkleTree(4, poseidon);
      const tree2 = new PoseidonMerkleTree(4, poseidon);

      tree1.insert(100n);
      tree2.insert(200n);

      expect(tree1.getRoot()).not.toBe(tree2.getRoot());
    });

    it("insertion order matters", () => {
      const tree1 = new PoseidonMerkleTree(4, poseidon);
      const tree2 = new PoseidonMerkleTree(4, poseidon);

      tree1.insert(1n);
      tree1.insert(2n);

      tree2.insert(2n);
      tree2.insert(1n);

      expect(tree1.getRoot()).not.toBe(tree2.getRoot());
    });
  });

  describe("proof generation and verification", () => {
    it("should generate valid Merkle proofs", () => {
      const tree = new PoseidonMerkleTree(4, poseidon);
      tree.insert(10n);
      tree.insert(20n);
      tree.insert(30n);
      tree.insert(40n);

      for (let i = 0; i < 4; i++) {
        const proof = tree.getProof(i);
        expect(proof.pathElements.length).toBe(4);
        expect(proof.pathIndices.length).toBe(4);

        // Each pathIndex should be 0 or 1
        for (const idx of proof.pathIndices) {
          expect(idx === 0 || idx === 1).toBe(true);
        }
      }
    });

    it("should verify proofs match expected path", () => {
      const tree = new PoseidonMerkleTree(4, poseidon);
      tree.insert(10n);
      tree.insert(20n);
      tree.insert(30n);
      tree.insert(40n);

      // Verify each leaf's proof
      const leaves = [10n, 20n, 30n, 40n];
      for (let i = 0; i < leaves.length; i++) {
        const proof = tree.getProof(i);
        expect(tree.verifyProof(leaves[i], proof)).toBe(true);
      }
    });

    it("proof should fail with wrong leaf", () => {
      const tree = new PoseidonMerkleTree(4, poseidon);
      tree.insert(10n);
      tree.insert(20n);

      const proof = tree.getProof(0);
      // Use wrong leaf value
      expect(tree.verifyProof(999n, proof)).toBe(false);
    });

    it("proof should fail with modified path element", () => {
      const tree = new PoseidonMerkleTree(4, poseidon);
      tree.insert(10n);
      tree.insert(20n);

      const proof = tree.getProof(0);
      // Tamper with a sibling
      proof.pathElements[0] = 999999n;
      expect(tree.verifyProof(10n, proof)).toBe(false);
    });

    it("should throw for out-of-range index", () => {
      const tree = new PoseidonMerkleTree(4, poseidon);
      tree.insert(10n);

      expect(() => tree.getProof(-1)).toThrow();
      expect(() => tree.getProof(1)).toThrow();
    });

    it("proof for single leaf should work", () => {
      const tree = new PoseidonMerkleTree(4, poseidon);
      tree.insert(42n);

      const proof = tree.getProof(0);
      expect(tree.verifyProof(42n, proof)).toBe(true);
    });

    it("proofs should work with many leaves", () => {
      const depth = 5;
      const tree = new PoseidonMerkleTree(depth, poseidon);
      const numLeaves = 20;

      for (let i = 0; i < numLeaves; i++) {
        tree.insert(BigInt(i * 100 + 1));
      }

      // Verify proofs for all leaves
      for (let i = 0; i < numLeaves; i++) {
        const proof = tree.getProof(i);
        expect(tree.verifyProof(BigInt(i * 100 + 1), proof)).toBe(true);
      }
    });
  });

  describe("manual root verification", () => {
    it("root for depth=1 tree with two leaves should be poseidon(leaf0, leaf1)", () => {
      const tree = new PoseidonMerkleTree(1, poseidon);
      tree.insert(5n);
      tree.insert(7n);

      const expected = poseidonHash(5n, 7n);
      expect(tree.getRoot()).toBe(expected);
    });

    it("root for depth=1 tree with one leaf should be poseidon(leaf0, zero[0])", () => {
      const tree = new PoseidonMerkleTree(1, poseidon);
      tree.insert(5n);

      const expected = poseidonHash(5n, tree.zeroValues[0]);
      expect(tree.getRoot()).toBe(expected);
    });

    it("root for depth=2 with four leaves should match manual computation", () => {
      const tree = new PoseidonMerkleTree(2, poseidon);
      tree.insert(1n);
      tree.insert(2n);
      tree.insert(3n);
      tree.insert(4n);

      const h01 = poseidonHash(1n, 2n);
      const h23 = poseidonHash(3n, 4n);
      const expected = poseidonHash(h01, h23);

      expect(tree.getRoot()).toBe(expected);
    });
  });

  describe("serialization", () => {
    it("should serialize and deserialize correctly", () => {
      const tree = new PoseidonMerkleTree(4, poseidon);
      tree.insert(100n);
      tree.insert(200n);
      tree.insert(300n);

      const json = tree.toJSON();
      const restored = PoseidonMerkleTree.fromJSON(json, poseidon);

      expect(restored.getRoot()).toBe(tree.getRoot());
      expect(restored.getLeafCount()).toBe(tree.getLeafCount());
      expect(restored.depth).toBe(tree.depth);

      // Proofs should also match
      for (let i = 0; i < 3; i++) {
        const origProof = tree.getProof(i);
        const restoredProof = restored.getProof(i);
        expect(restoredProof.pathElements).toEqual(origProof.pathElements);
        expect(restoredProof.pathIndices).toEqual(origProof.pathIndices);
      }
    });

    it("should serialize to valid JSON-compatible object", () => {
      const tree = new PoseidonMerkleTree(4, poseidon);
      tree.insert(42n);

      const json = tree.toJSON();
      // Should be serializable to a JSON string and back
      const str = JSON.stringify(json);
      const parsed = JSON.parse(str);

      expect(parsed.depth).toBe(4);
      expect(parsed.leaves).toEqual(["42"]);
      expect(parsed.nextIndex).toBe(1);
    });
  });

  describe("Poseidon output compatibility", () => {
    it("Poseidon output should match circomlib known behavior", () => {
      // Poseidon(0, 0) should be a non-zero value
      const h = poseidonHash(0n, 0n);
      expect(h).not.toBe(0n);
      expect(typeof h).toBe("bigint");
      expect(h > 0n).toBe(true);

      // Poseidon should be deterministic
      const h2 = poseidonHash(0n, 0n);
      expect(h2).toBe(h);
    });

    it("Poseidon should produce values in the BN128 field", () => {
      // BN128 scalar field prime
      const BN128_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

      const h1 = poseidonHash(1n, 2n);
      expect(h1 > 0n).toBe(true);
      expect(h1 < BN128_PRIME).toBe(true);

      const h2 = poseidonHash(
        123456789012345678901234567890n,
        987654321098765432109876543210n
      );
      expect(h2 > 0n).toBe(true);
      expect(h2 < BN128_PRIME).toBe(true);
    });

    it("different inputs should produce different hashes", () => {
      const h1 = poseidonHash(1n, 2n);
      const h2 = poseidonHash(2n, 1n);
      const h3 = poseidonHash(1n, 3n);

      expect(h1).not.toBe(h2);
      expect(h1).not.toBe(h3);
      expect(h2).not.toBe(h3);
    });
  });
});
