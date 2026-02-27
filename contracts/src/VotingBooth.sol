// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IVerifier.sol";
import "./interfaces/IVotingRegistry.sol";

/// @title VotingBooth
/// @notice Accepts ZK-proven votes, verifies Groth16 proofs against the
///         on-chain verifier, and tallies weighted results per tier.
contract VotingBooth {
    // ----------------------------------------------------------------
    // Types
    // ----------------------------------------------------------------

    struct TierConfig {
        uint256 minBalance;   // inclusive (in plancks, 1 DOT = 10^10)
        uint256 maxBalance;   // exclusive
        uint256 weight;
        uint256 packedConfig; // tierMin * 2^128 + tierMax (matches circuit)
    }

    // ----------------------------------------------------------------
    // State
    // ----------------------------------------------------------------

    IVerifier public verifier;
    IVotingRegistry public registry;
    address public owner;

    TierConfig[] public tiers;

    // proposalId => tier => voteChoice => weighted count
    mapping(bytes32 => mapping(uint8 => mapping(uint8 => uint256))) public tally;

    // proposalId => nullifier => used
    mapping(bytes32 => mapping(bytes32 => bool)) public nullifierUsed;

    // proposalId => total votes cast
    mapping(bytes32 => uint256) public totalVotes;

    // ----------------------------------------------------------------
    // Events
    // ----------------------------------------------------------------

    event VoteCast(
        bytes32 indexed proposalId,
        uint8 tier,
        uint8 voteChoice,
        bytes32 nullifier
    );

    event TierConfigured(
        uint8 indexed tierId,
        uint256 minBalance,
        uint256 maxBalance,
        uint256 weight
    );

    // ----------------------------------------------------------------
    // Modifiers
    // ----------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ----------------------------------------------------------------
    // Constructor
    // ----------------------------------------------------------------

    constructor(address _verifier, address _registry) {
        verifier = IVerifier(_verifier);
        registry = IVotingRegistry(_registry);
        owner = msg.sender;
    }

    // ----------------------------------------------------------------
    // Configuration
    // ----------------------------------------------------------------

    /// @notice Add a new voting tier.
    /// @param minBalance Minimum balance (inclusive) in plancks.
    /// @param maxBalance Maximum balance (exclusive) in plancks.
    /// @param weight     Voting weight for this tier.
    function configureTier(
        uint256 minBalance,
        uint256 maxBalance,
        uint256 weight
    ) external onlyOwner {
        uint256 packedConfig = (minBalance << 128) | maxBalance;
        uint8 tierId = uint8(tiers.length);
        tiers.push(TierConfig(minBalance, maxBalance, weight, packedConfig));
        emit TierConfigured(tierId, minBalance, maxBalance, weight);
    }

    // ----------------------------------------------------------------
    // Voting
    // ----------------------------------------------------------------

    /// @notice Submit a vote with a ZK proof.
    /// @param pA             Groth16 proof element A.
    /// @param pB             Groth16 proof element B.
    /// @param pC             Groth16 proof element C.
    /// @param ownershipRoot  The ownership Merkle root used in the proof.
    /// @param balancesRoot   The balances Merkle root used in the proof.
    /// @param proposalId     The proposal being voted on.
    /// @param voteChoice     0 = nay, 1 = aye, 2 = abstain.
    /// @param tier           The tier the voter claims to belong to.
    /// @param nullifier      Unique nullifier derived inside the circuit.
    function vote(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        bytes32 ownershipRoot,
        bytes32 balancesRoot,
        bytes32 proposalId,
        uint8 voteChoice,
        uint8 tier,
        bytes32 nullifier
    ) external {
        // 1. Check nullifier hasn't been used for this proposal
        require(!nullifierUsed[proposalId][nullifier], "Already voted");

        // 2. Verify roots are known to the registry
        require(
            registry.isKnownOwnershipRoot(ownershipRoot),
            "Unknown ownership root"
        );
        require(
            registry.isKnownBalancesRoot(balancesRoot),
            "Unknown balances root"
        );

        // 3. Validate tier
        require(tier < tiers.length, "Invalid tier");

        // 4. Validate vote choice (0=nay, 1=aye, 2=abstain)
        require(voteChoice <= 2, "Invalid vote choice");

        // 5. Construct public inputs and verify ZK proof
        uint256[7] memory pubInputs = [
            uint256(ownershipRoot),
            uint256(balancesRoot),
            uint256(proposalId),
            uint256(voteChoice),
            uint256(tier),
            uint256(nullifier),
            tiers[tier].packedConfig
        ];
        require(
            verifier.verifyProof(pA, pB, pC, pubInputs),
            "Invalid proof"
        );

        // 6. Record vote
        nullifierUsed[proposalId][nullifier] = true;
        tally[proposalId][tier][voteChoice] += tiers[tier].weight;
        totalVotes[proposalId]++;

        emit VoteCast(proposalId, tier, voteChoice, nullifier);
    }

    // ----------------------------------------------------------------
    // View helpers
    // ----------------------------------------------------------------

    /// @notice Get aggregate results for a proposal across all tiers.
    function getResults(bytes32 proposalId)
        external
        view
        returns (
            uint256 totalAye,
            uint256 totalNay,
            uint256 totalAbstain,
            uint256 voteCount
        )
    {
        for (uint8 t = 0; t < tiers.length; t++) {
            totalAye += tally[proposalId][t][1];
            totalNay += tally[proposalId][t][0];
            totalAbstain += tally[proposalId][t][2];
        }
        voteCount = totalVotes[proposalId];
    }

    /// @notice Get results for a specific tier and proposal.
    function getTierResults(bytes32 proposalId, uint8 tier)
        external
        view
        returns (uint256 aye, uint256 nay, uint256 abstain)
    {
        aye = tally[proposalId][tier][1];
        nay = tally[proposalId][tier][0];
        abstain = tally[proposalId][tier][2];
    }

    /// @notice Get the number of configured tiers.
    function getTierCount() external view returns (uint256) {
        return tiers.length;
    }
}
