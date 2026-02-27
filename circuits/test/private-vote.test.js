const path = require("path");
const assert = require("chai").assert;
const { readFileSync, existsSync } = require("fs");

// We build all trees and hashes using circomlibjs to match the circuit exactly.
// The circuit uses the WASM witness calculator for constraint checking.

const DEPTH = 20;

let poseidon;
let wc; // witness calculator

/**
 * Poseidon hash wrapper returning BigInt.
 */
function poseidonHash(inputs) {
    const h = poseidon(inputs.map((x) => BigInt(x)));
    return poseidon.F.toObject(h);
}

/**
 * Build a Merkle tree from leaves, zero-filled to 2^depth.
 */
function buildMerkleTree(leaves, depth) {
    const totalLeaves = 2 ** depth;
    const paddedLeaves = new Array(totalLeaves).fill(BigInt(0));
    for (let i = 0; i < leaves.length; i++) {
        paddedLeaves[i] = BigInt(leaves[i]);
    }

    const layers = [paddedLeaves];
    let current = paddedLeaves;

    for (let level = 0; level < depth; level++) {
        const next = [];
        for (let i = 0; i < current.length; i += 2) {
            next.push(poseidonHash([current[i], current[i + 1]]));
        }
        layers.push(next);
        current = next;
    }

    return { layers, root: current[0] };
}

/**
 * Get Merkle proof for leaf at index.
 */
function getMerkleProof(tree, index, depth) {
    const pathElements = [];
    const pathIndices = [];
    let idx = index;

    for (let level = 0; level < depth; level++) {
        const isRight = idx % 2;
        const siblingIdx = isRight ? idx - 1 : idx + 1;
        pathIndices.push(isRight);
        pathElements.push(tree.layers[level][siblingIdx]);
        idx = Math.floor(idx / 2);
    }

    return { pathElements, pathIndices };
}

/**
 * Compute tierConfig = tierMin * 2^128 + tierMax
 */
function computeTierConfig(tierMin, tierMax) {
    return BigInt(tierMin) * (BigInt(2) ** BigInt(128)) + BigInt(tierMax);
}

/**
 * Build a valid set of circuit inputs for a given account index.
 */
function buildValidInput(accounts, ownershipTree, balancesTree, accountIdx, proposalId, voteChoice) {
    const acct = accounts[accountIdx];
    const ownershipProof = getMerkleProof(ownershipTree, accountIdx, DEPTH);
    const balancesProof = getMerkleProof(balancesTree, accountIdx, DEPTH);

    const TIERS = [
        { tier: 0, min: BigInt(1), max: BigInt(100) },
        { tier: 1, min: BigInt(100), max: BigInt(1000) },
        { tier: 2, min: BigInt(1000), max: BigInt(10000) },
        { tier: 3, min: BigInt(10000), max: BigInt(100000) },
        { tier: 4, min: BigInt(100000), max: BigInt("100000000000000000000000000000000000000") },
    ];

    const tierInfo = TIERS.find(
        (t) => acct.balance >= t.min && acct.balance < t.max
    );

    const nullifierValue = poseidonHash([acct.secret, proposalId]);
    const tierConfigValue = computeTierConfig(tierInfo.min, tierInfo.max);

    return {
        // Public inputs
        ownershipRoot: ownershipTree.root.toString(),
        balancesRoot: balancesTree.root.toString(),
        proposalId: proposalId.toString(),
        voteChoice: voteChoice.toString(),
        tier: tierInfo.tier.toString(),
        nullifier: nullifierValue.toString(),
        tierConfig: tierConfigValue.toString(),
        // Private inputs
        secret: acct.secret.toString(),
        address: acct.address.toString(),
        balance: acct.balance.toString(),
        ownershipPathElements: ownershipProof.pathElements.map((e) => e.toString()),
        ownershipPathIndices: ownershipProof.pathIndices.map((e) => e.toString()),
        balancesPathElements: balancesProof.pathElements.map((e) => e.toString()),
        balancesPathIndices: balancesProof.pathIndices.map((e) => e.toString()),
        tierMin: tierInfo.min.toString(),
        tierMax: tierInfo.max.toString(),
    };
}

/**
 * Attempt to generate a witness from circuit inputs. Returns true if
 * witness generation succeeds, false if it fails (constraint violated).
 */
async function tryWitness(input) {
    try {
        await wc.calculateWitness(input, 0);
        return true;
    } catch (e) {
        return false;
    }
}

describe("PrivateVote Circuit", function () {
    let accounts;
    let ownershipTree;
    let balancesTree;
    const proposalId = BigInt(42);

    before(async function () {
        this.timeout(120000);

        // Initialize Poseidon
        const circomlibjs = require("circomlibjs");
        poseidon = await circomlibjs.buildPoseidon();

        // Load compiled WASM witness calculator
        const wasmPath = path.resolve(
            __dirname,
            "..",
            "build",
            "PrivateVote_js",
            "PrivateVote.wasm"
        );

        if (!existsSync(wasmPath)) {
            throw new Error(
                `Circuit WASM not found at ${wasmPath}. Run 'npm run compile' first.`
            );
        }

        const witnessCalcPath = path.resolve(
            __dirname,
            "..",
            "build",
            "PrivateVote_js",
            "witness_calculator.js"
        );

        const witnessCalcBuilder = require(witnessCalcPath);
        const wasmBuffer = readFileSync(wasmPath);
        wc = await witnessCalcBuilder(wasmBuffer);

        // Build test accounts
        accounts = [
            { secret: BigInt(111), address: BigInt(1001), balance: BigInt(50) },    // tier 0
            { secret: BigInt(222), address: BigInt(1002), balance: BigInt(500) },   // tier 1
            { secret: BigInt(333), address: BigInt(1003), balance: BigInt(5000) },  // tier 2
            { secret: BigInt(444), address: BigInt(1004), balance: BigInt(50000) }, // tier 3
            { secret: BigInt(555), address: BigInt(1005), balance: BigInt(200000) },// tier 4
        ];

        // Compute ownership and balances leaves
        const ownershipLeaves = [];
        const balancesLeaves = [];

        for (const acct of accounts) {
            acct.commitment = poseidonHash([acct.secret]);
            acct.ownershipLeaf = poseidonHash([acct.address, acct.commitment]);
            acct.balancesLeaf = poseidonHash([acct.address, acct.balance]);
            ownershipLeaves.push(acct.ownershipLeaf);
            balancesLeaves.push(acct.balancesLeaf);
        }

        // Build trees
        console.log("    Building Merkle trees (depth 20)...");
        ownershipTree = buildMerkleTree(ownershipLeaves, DEPTH);
        balancesTree = buildMerkleTree(balancesLeaves, DEPTH);
        console.log("    Trees built.");
    });

    // =========================================================
    // Test 1: Valid proof generation succeeds for each account
    // =========================================================
    describe("Valid proof generation", function () {
        it("should accept a valid proof for account 0 (tier 0, balance=50)", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            const success = await tryWitness(input);
            assert.isTrue(success, "Witness generation should succeed for valid inputs");
        });

        it("should accept a valid proof for account 1 (tier 1, balance=500)", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 1, proposalId, 0);
            const success = await tryWitness(input);
            assert.isTrue(success, "Witness generation should succeed for valid inputs");
        });

        it("should accept a valid proof for account 2 (tier 2, balance=5000)", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 2, proposalId, 2);
            const success = await tryWitness(input);
            assert.isTrue(success, "Witness generation should succeed for valid inputs");
        });

        it("should accept a valid proof for account 3 (tier 3, balance=50000)", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 3, proposalId, 1);
            const success = await tryWitness(input);
            assert.isTrue(success, "Witness generation should succeed for valid inputs");
        });

        it("should accept a valid proof for account 4 (tier 4, balance=200000)", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 4, proposalId, 1);
            const success = await tryWitness(input);
            assert.isTrue(success, "Witness generation should succeed for valid inputs");
        });

        it("should accept voteChoice=0 (nay)", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 0);
            const success = await tryWitness(input);
            assert.isTrue(success, "Vote choice 0 (nay) should be accepted");
        });

        it("should accept voteChoice=2 (abstain)", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 2);
            const success = await tryWitness(input);
            assert.isTrue(success, "Vote choice 2 (abstain) should be accepted");
        });
    });

    // =========================================================
    // Test 2: Wrong secret -> failure
    // =========================================================
    describe("Wrong secret", function () {
        it("should reject proof with wrong secret", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            // Change the secret to a wrong value
            input.secret = "999999";
            // Recompute nullifier with wrong secret to avoid nullifier constraint failure
            // But the ownership leaf will be wrong, so it should still fail
            input.nullifier = poseidonHash([BigInt(999999), proposalId]).toString();
            const success = await tryWitness(input);
            assert.isFalse(success, "Wrong secret should cause witness generation to fail");
        });
    });

    // =========================================================
    // Test 3: Balance outside claimed tier -> failure
    // =========================================================
    describe("Balance outside claimed tier", function () {
        it("should reject when balance is below tierMin", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            // Account 0 has balance=50, tier 0 is [1, 100)
            // Claim tier 1 which is [100, 1000) - balance 50 is below 100
            const tierMin = BigInt(100);
            const tierMax = BigInt(1000);
            input.tier = "1";
            input.tierMin = tierMin.toString();
            input.tierMax = tierMax.toString();
            input.tierConfig = computeTierConfig(tierMin, tierMax).toString();
            const success = await tryWitness(input);
            assert.isFalse(success, "Balance below tier min should fail");
        });

        it("should reject when balance is at or above tierMax", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 1, proposalId, 1);
            // Account 1 has balance=500, tier 1 is [100, 1000)
            // Claim tier 0 which is [1, 100) - balance 500 >= 100
            const tierMin = BigInt(1);
            const tierMax = BigInt(100);
            input.tier = "0";
            input.tierMin = tierMin.toString();
            input.tierMax = tierMax.toString();
            input.tierConfig = computeTierConfig(tierMin, tierMax).toString();
            const success = await tryWitness(input);
            assert.isFalse(success, "Balance at or above tier max should fail");
        });
    });

    // =========================================================
    // Test 4: Different proposalId -> different nullifier
    // =========================================================
    describe("Nullifier derivation", function () {
        it("should produce different nullifiers for different proposalIds", function () {
            const secret = BigInt(111);
            const pid1 = BigInt(42);
            const pid2 = BigInt(43);

            const nullifier1 = poseidonHash([secret, pid1]);
            const nullifier2 = poseidonHash([secret, pid2]);

            assert.notEqual(
                nullifier1.toString(),
                nullifier2.toString(),
                "Different proposalIds should produce different nullifiers"
            );
        });

        it("should reject mismatched nullifier", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            // Tamper with the nullifier
            input.nullifier = poseidonHash([BigInt(111), BigInt(99)]).toString();
            const success = await tryWitness(input);
            assert.isFalse(success, "Mismatched nullifier should fail");
        });
    });

    // =========================================================
    // Test 5: Invalid vote choice -> failure
    // =========================================================
    describe("Invalid vote choice", function () {
        it("should reject voteChoice=3", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            input.voteChoice = "3";
            const success = await tryWitness(input);
            assert.isFalse(success, "Vote choice 3 should be rejected");
        });

        it("should reject voteChoice=4", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            input.voteChoice = "4";
            const success = await tryWitness(input);
            assert.isFalse(success, "Vote choice 4 should be rejected");
        });

        it("should reject voteChoice=100", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            input.voteChoice = "100";
            const success = await tryWitness(input);
            assert.isFalse(success, "Vote choice 100 should be rejected");
        });
    });

    // =========================================================
    // Test 6: Wrong Merkle path -> failure
    // =========================================================
    describe("Wrong Merkle path", function () {
        it("should reject wrong ownership Merkle path", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            // Corrupt one element in the ownership path
            input.ownershipPathElements[0] = "123456789";
            const success = await tryWitness(input);
            assert.isFalse(success, "Wrong ownership Merkle path should fail");
        });

        it("should reject wrong balances Merkle path", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            // Corrupt one element in the balances path
            input.balancesPathElements[0] = "123456789";
            const success = await tryWitness(input);
            assert.isFalse(success, "Wrong balances Merkle path should fail");
        });

        it("should reject wrong ownership root", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            input.ownershipRoot = "999999999";
            const success = await tryWitness(input);
            assert.isFalse(success, "Wrong ownership root should fail");
        });

        it("should reject wrong balances root", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            input.balancesRoot = "999999999";
            const success = await tryWitness(input);
            assert.isFalse(success, "Wrong balances root should fail");
        });
    });

    // =========================================================
    // Test 7: Tier config mismatch -> failure
    // =========================================================
    describe("Tier config binding", function () {
        it("should reject mismatched tierConfig", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            // Tamper with tierConfig (use wrong values)
            input.tierConfig = computeTierConfig(BigInt(5), BigInt(200)).toString();
            const success = await tryWitness(input);
            assert.isFalse(success, "Mismatched tierConfig should fail");
        });

        it("should reject tierMin/tierMax that don't match tierConfig", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            // Keep tierConfig correct for tier 0 but change tierMin
            // tierConfig is for [1, 100), but set tierMin to 0
            input.tierMin = "0";
            const success = await tryWitness(input);
            assert.isFalse(success, "tierMin not matching tierConfig should fail");
        });
    });

    // =========================================================
    // Test 8: Wrong address -> failure
    // =========================================================
    describe("Wrong address", function () {
        it("should reject proof with wrong address", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            input.address = "9999";
            const success = await tryWitness(input);
            assert.isFalse(success, "Wrong address should cause failure (Merkle path won't match)");
        });
    });

    // =========================================================
    // Test 9: Wrong balance -> failure
    // =========================================================
    describe("Wrong balance", function () {
        it("should reject proof with wrong balance", async function () {
            const input = buildValidInput(accounts, ownershipTree, balancesTree, 0, proposalId, 1);
            input.balance = "51"; // actual is 50
            const success = await tryWitness(input);
            assert.isFalse(success, "Wrong balance should cause failure (balances Merkle path won't match)");
        });
    });
});
