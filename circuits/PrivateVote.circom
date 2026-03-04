pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";
include "lib/MerkleProof.circom";
include "lib/RangeProof.circom";

// PrivateVote proves:
// 1. The voter owns an address registered in the Ownership Merkle tree
// 2. That address has a certain balance in the Balances Merkle tree
// 3. The balance falls within a specific tier range
// 4. The nullifier is correctly derived (prevents double voting)
// 5. The vote choice is valid (0=nay, 1=aye, 2=abstain)
//
// Parameters:
//   OWNERSHIP_DEPTH - depth of the ownership Merkle tree (21 => ~2M leaves)
//   BALANCES_DEPTH  - depth of the balances Merkle tree (21 => ~2M leaves)

template PrivateVote(OWNERSHIP_DEPTH, BALANCES_DEPTH) {

    // === Public Inputs (7 signals) ===
    signal input ownershipRoot;
    signal input balancesRoot;
    signal input proposalId;
    signal input voteChoice;      // 0=nay, 1=aye, 2=abstain
    signal input tier;            // tier index (0-4), not directly constrained here
    signal input nullifier;       // anti-double-vote token
    signal input tierConfig;      // packed: tierMin * 2^128 + tierMax

    // === Private Inputs ===
    signal input secret;
    signal input address;
    signal input balance;
    signal input ownershipPathElements[OWNERSHIP_DEPTH];
    signal input ownershipPathIndices[OWNERSHIP_DEPTH];
    signal input balancesPathElements[BALANCES_DEPTH];
    signal input balancesPathIndices[BALANCES_DEPTH];
    signal input tierMin;
    signal input tierMax;

    // =========================================================
    // Constraint 1: Nullifier derivation
    // nullifier === Poseidon(secret, proposalId)
    // =========================================================
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== proposalId;
    nullifier === nullifierHasher.out;

    // =========================================================
    // Constraint 2: Commitment derivation
    // commitment = Poseidon(secret)
    // =========================================================
    component commitmentHasher = Poseidon(1);
    commitmentHasher.inputs[0] <== secret;
    signal commitment;
    commitment <== commitmentHasher.out;

    // =========================================================
    // Constraint 3: Ownership leaf
    // ownershipLeaf = Poseidon(address, commitment)
    // =========================================================
    component ownershipLeafHasher = Poseidon(2);
    ownershipLeafHasher.inputs[0] <== address;
    ownershipLeafHasher.inputs[1] <== commitment;
    signal ownershipLeaf;
    ownershipLeaf <== ownershipLeafHasher.out;

    // =========================================================
    // Constraint 4: Ownership Merkle proof verification
    // =========================================================
    component ownershipProof = MerkleProof(OWNERSHIP_DEPTH);
    ownershipProof.leaf <== ownershipLeaf;
    ownershipProof.root <== ownershipRoot;
    for (var i = 0; i < OWNERSHIP_DEPTH; i++) {
        ownershipProof.pathElements[i] <== ownershipPathElements[i];
        ownershipProof.pathIndices[i] <== ownershipPathIndices[i];
    }

    // =========================================================
    // Constraint 5: Balances leaf
    // balancesLeaf = Poseidon(address, balance)
    // =========================================================
    component balancesLeafHasher = Poseidon(2);
    balancesLeafHasher.inputs[0] <== address;
    balancesLeafHasher.inputs[1] <== balance;
    signal balancesLeaf;
    balancesLeaf <== balancesLeafHasher.out;

    // =========================================================
    // Constraint 6: Balances Merkle proof verification
    // =========================================================
    component balancesProof = MerkleProof(BALANCES_DEPTH);
    balancesProof.leaf <== balancesLeaf;
    balancesProof.root <== balancesRoot;
    for (var i = 0; i < BALANCES_DEPTH; i++) {
        balancesProof.pathElements[i] <== balancesPathElements[i];
        balancesProof.pathIndices[i] <== balancesPathIndices[i];
    }

    // =========================================================
    // Constraint 7: Balance range proof
    // tierMin <= balance < tierMax
    // =========================================================
    component rangeProof = RangeProof(252);
    rangeProof.value <== balance;
    rangeProof.lower <== tierMin;
    rangeProof.upper <== tierMax;

    // =========================================================
    // Constraint 8: Tier config binding
    // tierConfig === tierMin * 2^128 + tierMax
    //
    // We compute tierMin * 2^128 by shifting. Since 2^128 is a constant,
    // we can use it directly as a field element.
    // =========================================================
    signal tierMinShifted;
    // 2^128 as a constant
    tierMinShifted <== tierMin * 340282366920938463463374607431768211456;
    tierConfig === tierMinShifted + tierMax;

    // =========================================================
    // Constraint 9: Vote choice validity
    // voteChoice must be 0, 1, or 2
    // voteChoice * (voteChoice - 1) * (voteChoice - 2) === 0
    // =========================================================
    signal voteCheck1;
    signal voteCheck2;
    voteCheck1 <== voteChoice * (voteChoice - 1);
    voteCheck2 <== voteCheck1 * (voteChoice - 2);
    voteCheck2 === 0;
}

// Instantiate the main component with depth 21 for both trees (~2M leaves each).
// Public inputs: ownershipRoot, balancesRoot, proposalId, voteChoice, tier, nullifier, tierConfig
component main {public [ownershipRoot, balancesRoot, proposalId, voteChoice, tier, nullifier, tierConfig]} = PrivateVote(20, 20);
