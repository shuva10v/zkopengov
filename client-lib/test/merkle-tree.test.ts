import { PoseidonMerkleTree, buildOwnershipTreeFromData, buildBalancesTreeFromData } from '../src/merkle-tree';
import { initPoseidon, poseidonHash } from '../src/poseidon';

describe('merkle-tree', () => {
    beforeAll(async () => {
        await initPoseidon();
    });

    describe('PoseidonMerkleTree', () => {
        it('empty tree has a deterministic zero root', () => {
            const tree1 = new PoseidonMerkleTree(4);
            const tree2 = new PoseidonMerkleTree(4);
            expect(tree1.getRoot()).toEqual(tree2.getRoot());
            // Root should not be zero -- it is the hash chain of zeros
            expect(tree1.getRoot()).not.toEqual(0n);
        });

        it('insert updates root', () => {
            const tree = new PoseidonMerkleTree(4);
            const rootBefore = tree.getRoot();
            tree.insert(123n);
            const rootAfter = tree.getRoot();
            expect(rootAfter).not.toEqual(rootBefore);
        });

        it('same leaves produce same root', () => {
            const tree1 = new PoseidonMerkleTree(4);
            const tree2 = new PoseidonMerkleTree(4);
            const leaves = [10n, 20n, 30n];
            for (const leaf of leaves) {
                tree1.insert(leaf);
                tree2.insert(leaf);
            }
            expect(tree1.getRoot()).toEqual(tree2.getRoot());
        });

        it('different leaves produce different roots', () => {
            const tree1 = new PoseidonMerkleTree(4);
            const tree2 = new PoseidonMerkleTree(4);
            tree1.insert(10n);
            tree2.insert(20n);
            expect(tree1.getRoot()).not.toEqual(tree2.getRoot());
        });

        it('getProof returns valid path with correct length', () => {
            const depth = 4;
            const tree = new PoseidonMerkleTree(depth);
            tree.insert(100n);
            tree.insert(200n);
            tree.insert(300n);

            const proof = tree.getProof(1);
            expect(proof.pathElements).toHaveLength(depth);
            expect(proof.pathIndices).toHaveLength(depth);
            // All pathIndices should be 0 or 1
            for (const idx of proof.pathIndices) {
                expect([0, 1]).toContain(idx);
            }
        });

        it('proof verification: recompute root from leaf + proof matches tree root', () => {
            const depth = 4;
            const tree = new PoseidonMerkleTree(depth);
            const leaves = [11n, 22n, 33n, 44n, 55n];
            for (const leaf of leaves) {
                tree.insert(leaf);
            }

            // Verify proof for each leaf
            for (let i = 0; i < leaves.length; i++) {
                const proof = tree.getProof(i);
                let currentHash = leaves[i];

                for (let level = 0; level < depth; level++) {
                    const sibling = proof.pathElements[level];
                    if (proof.pathIndices[level] === 0) {
                        // Current node is on the left
                        currentHash = poseidonHash([currentHash, sibling]);
                    } else {
                        // Current node is on the right
                        currentHash = poseidonHash([sibling, currentHash]);
                    }
                }

                expect(currentHash).toEqual(tree.getRoot());
            }
        });

        it('fromLeaves builds correctly', () => {
            const leaves = [10n, 20n, 30n, 40n];
            const tree1 = PoseidonMerkleTree.fromLeaves(leaves, 4);

            // Build same tree by sequential insert
            const tree2 = new PoseidonMerkleTree(4);
            for (const leaf of leaves) {
                tree2.insert(leaf);
            }

            expect(tree1.getRoot()).toEqual(tree2.getRoot());
        });

        it('fromLeaves preserves leaf count', () => {
            const leaves = [1n, 2n, 3n];
            const tree = PoseidonMerkleTree.fromLeaves(leaves, 4);
            expect(tree.getLeafCount()).toBe(3);
        });

        it('throws when tree is full', () => {
            const tree = new PoseidonMerkleTree(2); // max 4 leaves
            tree.insert(1n);
            tree.insert(2n);
            tree.insert(3n);
            tree.insert(4n);
            expect(() => tree.insert(5n)).toThrow('Tree is full');
        });

        it('throws for out-of-range proof index', () => {
            const tree = new PoseidonMerkleTree(4);
            tree.insert(1n);
            expect(() => tree.getProof(1)).toThrow('out of range');
            expect(() => tree.getProof(-1)).toThrow('out of range');
        });
    });

    describe('buildOwnershipTreeFromData', () => {
        it('computes correct leaves from address and commitment', () => {
            const address = 'abcdef1234567890abcdef1234567890abcdef12';
            const commitment = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

            const tree = buildOwnershipTreeFromData([{ address, commitment }]);
            expect(tree.getLeafCount()).toBe(1);

            // Verify the leaf value
            const addressBigInt = BigInt('0x' + address);
            const commitmentBigInt = BigInt('0x' + commitment);
            const expectedLeaf = poseidonHash([addressBigInt, commitmentBigInt]);

            // Build a reference tree with the expected leaf
            const refTree = PoseidonMerkleTree.fromLeaves([expectedLeaf]);
            expect(tree.getRoot()).toEqual(refTree.getRoot());
        });

        it('handles 0x-prefixed addresses', () => {
            const address = '0xabcdef1234567890abcdef1234567890abcdef12';
            const commitment = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

            const tree = buildOwnershipTreeFromData([{ address, commitment }]);
            expect(tree.getLeafCount()).toBe(1);
        });

        it('produces consistent results', () => {
            const leaves = [
                { address: 'aa', commitment: 'bb' },
                { address: 'cc', commitment: 'dd' },
            ];
            const tree1 = buildOwnershipTreeFromData(leaves);
            const tree2 = buildOwnershipTreeFromData(leaves);
            expect(tree1.getRoot()).toEqual(tree2.getRoot());
        });
    });

    describe('buildBalancesTreeFromData', () => {
        it('computes correct leaves from address and balance', () => {
            const address = 'abcdef1234567890abcdef1234567890abcdef12';
            const balance = '50000000000000'; // 5000 DOT

            const tree = buildBalancesTreeFromData([{ address, balance }]);
            expect(tree.getLeafCount()).toBe(1);

            // Verify the leaf value
            const addressBigInt = BigInt('0x' + address);
            const balanceBigInt = BigInt(balance);
            const expectedLeaf = poseidonHash([addressBigInt, balanceBigInt]);

            const refTree = PoseidonMerkleTree.fromLeaves([expectedLeaf]);
            expect(tree.getRoot()).toEqual(refTree.getRoot());
        });

        it('handles multiple entries', () => {
            const leaves = [
                { address: 'aa', balance: '100000000000' },
                { address: 'bb', balance: '200000000000' },
                { address: 'cc', balance: '300000000000' },
            ];
            const tree = buildBalancesTreeFromData(leaves);
            expect(tree.getLeafCount()).toBe(3);
        });

        it('produces consistent results', () => {
            const leaves = [
                { address: 'aa', balance: '1000' },
                { address: 'bb', balance: '2000' },
            ];
            const tree1 = buildBalancesTreeFromData(leaves);
            const tree2 = buildBalancesTreeFromData(leaves);
            expect(tree1.getRoot()).toEqual(tree2.getRoot());
        });
    });
});
