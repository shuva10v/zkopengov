#!/usr/bin/env node

/**
 * generate-fixtures.js
 *
 * Builds Poseidon Merkle trees and generates test fixtures for the
 * PrivateVote circuit tests.
 *
 * Creates 5 test accounts with known secrets and balances, builds
 * ownership and balances trees (depth 20), and outputs JSON fixtures
 * with all Merkle proofs.
 *
 * Usage:
 *   node test/fixtures/generate-fixtures.js
 */

const path = require("path");
const fs = require("fs");

// We need to use BigInt throughout for field element arithmetic.
// circomlibjs returns BigInt values from Poseidon.

async function buildPoseidon() {
    const circomlibjs = require("circomlibjs");
    const poseidon = await circomlibjs.buildPoseidon();
    return poseidon;
}

/**
 * Hash function wrapper that returns a BigInt field element.
 */
function poseidonHash(poseidon, inputs) {
    const hash = poseidon(inputs.map((x) => BigInt(x)));
    return poseidon.F.toObject(hash);
}

/**
 * Build a Merkle tree of given depth from an array of leaves.
 * Empty leaves are filled with 0. Returns {layers, root}.
 */
function buildMerkleTree(poseidon, leaves, depth) {
    const totalLeaves = 2 ** depth;
    const paddedLeaves = new Array(totalLeaves).fill(BigInt(0));
    for (let i = 0; i < leaves.length; i++) {
        paddedLeaves[i] = BigInt(leaves[i]);
    }

    const layers = [paddedLeaves];

    let currentLayer = paddedLeaves;
    for (let level = 0; level < depth; level++) {
        const nextLayer = [];
        for (let i = 0; i < currentLayer.length; i += 2) {
            const left = currentLayer[i];
            const right = currentLayer[i + 1];
            nextLayer.push(poseidonHash(poseidon, [left, right]));
        }
        layers.push(nextLayer);
        currentLayer = nextLayer;
    }

    return {
        layers,
        root: currentLayer[0],
    };
}

/**
 * Get the Merkle proof for a leaf at a given index.
 */
function getMerkleProof(tree, index, depth) {
    const pathElements = [];
    const pathIndices = [];

    let currentIndex = index;
    for (let level = 0; level < depth; level++) {
        const isRight = currentIndex % 2;
        const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

        pathIndices.push(isRight);
        pathElements.push(tree.layers[level][siblingIndex]);

        currentIndex = Math.floor(currentIndex / 2);
    }

    return { pathElements, pathIndices };
}

/**
 * Tier configuration for testing.
 * Matches the tiers from CLAUDE.md.
 */
const TIERS = [
    { tier: 0, min: BigInt(1), max: BigInt(100) },
    { tier: 1, min: BigInt(100), max: BigInt(1000) },
    { tier: 2, min: BigInt(1000), max: BigInt(10000) },
    { tier: 3, min: BigInt(10000), max: BigInt(100000) },
    {
        tier: 4,
        min: BigInt(100000),
        max: BigInt("100000000000000000000000000000000000000"),
    }, // effectively infinite upper bound
];

function computeTierConfig(tierMin, tierMax) {
    const shift = BigInt(2) ** BigInt(128);
    return BigInt(tierMin) * shift + BigInt(tierMax);
}

async function main() {
    const poseidon = await buildPoseidon();
    const DEPTH = 20;

    // --- Test accounts ---
    const accounts = [
        { secret: BigInt(111), address: BigInt(1001), balance: BigInt(50) }, // tier 0
        { secret: BigInt(222), address: BigInt(1002), balance: BigInt(500) }, // tier 1
        { secret: BigInt(333), address: BigInt(1003), balance: BigInt(5000) }, // tier 2
        { secret: BigInt(444), address: BigInt(1004), balance: BigInt(50000) }, // tier 3
        { secret: BigInt(555), address: BigInt(1005), balance: BigInt(200000) }, // tier 4
    ];

    // Compute commitments and leaves
    const ownershipLeaves = [];
    const balancesLeaves = [];

    for (const acct of accounts) {
        // commitment = Poseidon(secret)
        acct.commitment = poseidonHash(poseidon, [acct.secret]);

        // ownership leaf = Poseidon(address, commitment)
        acct.ownershipLeaf = poseidonHash(poseidon, [
            acct.address,
            acct.commitment,
        ]);

        // balances leaf = Poseidon(address, balance)
        acct.balancesLeaf = poseidonHash(poseidon, [
            acct.address,
            acct.balance,
        ]);

        ownershipLeaves.push(acct.ownershipLeaf);
        balancesLeaves.push(acct.balancesLeaf);
    }

    // Build trees
    console.log(`Building ownership Merkle tree (depth ${DEPTH})...`);
    const ownershipTree = buildMerkleTree(poseidon, ownershipLeaves, DEPTH);
    console.log(`Ownership root: ${ownershipTree.root}`);

    console.log(`Building balances Merkle tree (depth ${DEPTH})...`);
    const balancesTree = buildMerkleTree(poseidon, balancesLeaves, DEPTH);
    console.log(`Balances root: ${balancesTree.root}`);

    // Generate fixtures for each account
    const proposalId = BigInt(42);

    const fixtures = accounts.map((acct, idx) => {
        const ownershipProof = getMerkleProof(ownershipTree, idx, DEPTH);
        const balancesProof = getMerkleProof(balancesTree, idx, DEPTH);

        // Find the tier for this account
        const tierInfo = TIERS.find(
            (t) => acct.balance >= t.min && acct.balance < t.max
        );

        // nullifier = Poseidon(secret, proposalId)
        const nullifierValue = poseidonHash(poseidon, [
            acct.secret,
            proposalId,
        ]);

        const tierConfigValue = computeTierConfig(tierInfo.min, tierInfo.max);

        return {
            // Public inputs
            ownershipRoot: ownershipTree.root.toString(),
            balancesRoot: balancesTree.root.toString(),
            proposalId: proposalId.toString(),
            voteChoice: "1", // aye
            tier: tierInfo.tier.toString(),
            nullifier: nullifierValue.toString(),
            tierConfig: tierConfigValue.toString(),

            // Private inputs
            secret: acct.secret.toString(),
            address: acct.address.toString(),
            balance: acct.balance.toString(),
            ownershipPathElements: ownershipProof.pathElements.map((e) =>
                e.toString()
            ),
            ownershipPathIndices: ownershipProof.pathIndices.map((e) =>
                e.toString()
            ),
            balancesPathElements: balancesProof.pathElements.map((e) =>
                e.toString()
            ),
            balancesPathIndices: balancesProof.pathIndices.map((e) =>
                e.toString()
            ),
            tierMin: tierInfo.min.toString(),
            tierMax: tierInfo.max.toString(),

            // Metadata (not circuit inputs, for reference only)
            _meta: {
                accountIndex: idx,
                tierIndex: tierInfo.tier,
                commitment: acct.commitment.toString(),
                ownershipLeaf: acct.ownershipLeaf.toString(),
                balancesLeaf: acct.balancesLeaf.toString(),
            },
        };
    });

    // Write fixtures
    const outputDir = path.resolve(__dirname);
    const outputPath = path.join(outputDir, "test-fixtures.json");
    fs.writeFileSync(
        outputPath,
        JSON.stringify(
            {
                depth: DEPTH,
                proposalId: proposalId.toString(),
                ownershipRoot: ownershipTree.root.toString(),
                balancesRoot: balancesTree.root.toString(),
                tiers: TIERS.map((t) => ({
                    tier: t.tier,
                    min: t.min.toString(),
                    max: t.max.toString(),
                    tierConfig: computeTierConfig(t.min, t.max).toString(),
                })),
                accounts: fixtures,
            },
            null,
            2
        )
    );

    console.log(`\nFixtures written to ${outputPath}`);
    console.log(`${fixtures.length} test accounts generated.`);

    // Also write the first account as input-example.json for convenience
    const examplePath = path.resolve(__dirname, "..", "..", "input-example.json");
    const exampleInput = { ...fixtures[0] };
    delete exampleInput._meta;
    fs.writeFileSync(examplePath, JSON.stringify(exampleInput, null, 2));
    console.log(`Example input written to ${examplePath}`);
}

main().catch((err) => {
    console.error("Error generating fixtures:", err);
    process.exit(1);
});
