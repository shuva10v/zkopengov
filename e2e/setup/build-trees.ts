/**
 * Build both Merkle trees (ownership and balances) from test account data.
 *
 * Ownership tree leaves:  Poseidon(address, commitment)
 *   where commitment = Poseidon(secret)
 *
 * Balances tree leaves:   Poseidon(address, balance)
 *
 * Both trees use depth 20 to match the circuit.
 */

import { PoseidonMerkleTree } from "../helpers/tree-builder";
import { poseidonHash } from "../helpers/poseidon";
import { TestAccount } from "./test-accounts";

const TREE_DEPTH = 20;

/**
 * Build both the ownership and balances Merkle trees for the given test accounts.
 *
 * @param accounts  - Array of TestAccount definitions
 * @param signers   - Hardhat signers (to get addresses)
 * @param poseidon  - The circomlibjs Poseidon hash function
 * @param F         - The circomlibjs finite field
 * @returns Both trees ready for root submission
 */
export async function buildTestTrees(
  accounts: TestAccount[],
  signers: any[],
  poseidon: any,
  F: any
): Promise<{
  ownershipTree: PoseidonMerkleTree;
  balancesTree: PoseidonMerkleTree;
}> {
  const ownershipTree = new PoseidonMerkleTree(TREE_DEPTH, poseidon, F);
  const balancesTree = new PoseidonMerkleTree(TREE_DEPTH, poseidon, F);

  for (const account of accounts) {
    const signer = signers[account.signerIndex];
    const address = await signer.getAddress();
    const addressBigInt = BigInt(address);

    // Compute commitment = Poseidon(secret)
    const commitment = poseidonHash(poseidon, F, [account.secret]);

    // Ownership leaf = Poseidon(address, commitment)
    const ownershipLeaf = poseidonHash(poseidon, F, [
      addressBigInt,
      commitment,
    ]);
    ownershipTree.insert(ownershipLeaf);

    // Balances leaf = Poseidon(address, balance)
    const balancesLeaf = poseidonHash(poseidon, F, [
      addressBigInt,
      account.balance,
    ]);
    balancesTree.insert(balancesLeaf);
  }

  return { ownershipTree, balancesTree };
}
