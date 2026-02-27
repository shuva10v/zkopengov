pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

// MerkleProof verifies that a leaf belongs to a Merkle tree with a given root.
// At each level, we select left/right children based on the path index bit,
// hash them together with Poseidon(left, right), and check the final hash
// equals the claimed root.
//
// Parameters:
//   DEPTH - the depth of the Merkle tree (number of levels)
//
// Inputs:
//   leaf           - the leaf value to verify membership of
//   pathElements   - sibling hashes along the path from leaf to root
//   pathIndices    - 0/1 bits indicating if the node is a left or right child
//   root           - the expected Merkle root
//
// The template constrains that the computed root equals the provided root.

template MerkleProof(DEPTH) {
    signal input leaf;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];
    signal input root;

    signal hashes[DEPTH + 1];
    hashes[0] <== leaf;

    component hashers[DEPTH];

    for (var i = 0; i < DEPTH; i++) {
        // Constrain pathIndices to be 0 or 1
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        hashers[i] = Poseidon(2);

        // If pathIndices[i] == 0, current node is on the left:
        //   left = hashes[i], right = pathElements[i]
        // If pathIndices[i] == 1, current node is on the right:
        //   left = pathElements[i], right = hashes[i]

        // left = hashes[i] + pathIndices[i] * (pathElements[i] - hashes[i])
        //      = (1 - pathIndices[i]) * hashes[i] + pathIndices[i] * pathElements[i]
        hashers[i].inputs[0] <== hashes[i] + pathIndices[i] * (pathElements[i] - hashes[i]);

        // right = pathElements[i] + pathIndices[i] * (hashes[i] - pathElements[i])
        //       = (1 - pathIndices[i]) * pathElements[i] + pathIndices[i] * hashes[i]
        hashers[i].inputs[1] <== pathElements[i] + pathIndices[i] * (hashes[i] - pathElements[i]);

        hashes[i + 1] <== hashers[i].out;
    }

    // Final computed root must equal the provided root
    root === hashes[DEPTH];
}
