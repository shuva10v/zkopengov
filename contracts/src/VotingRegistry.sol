// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IVotingRegistry.sol";

/// @title VotingRegistry
/// @notice Manages voter registration (commitment submission) and Merkle tree
///         root storage for both the ownership tree and the balances tree.
///         An off-chain tree-builder service computes the trees and submits
///         roots on-chain so that the ZK circuit can reference them.
contract VotingRegistry is IVotingRegistry {
    // ----------------------------------------------------------------
    // Types
    // ----------------------------------------------------------------

    struct Registration {
        address account;
        bytes32 commitment; // Poseidon(secret) -- submitted by user
    }

    // ----------------------------------------------------------------
    // State
    // ----------------------------------------------------------------

    Registration[] public registrations;
    mapping(address => bool) public isRegistered;

    // Ownership tree roots
    mapping(bytes32 => bool) public knownOwnershipRoots;
    bytes32 public latestOwnershipRoot;

    // Balances tree roots (root => snapshot block number)
    mapping(bytes32 => uint256) public balancesRootBlock;
    bytes32 public latestBalancesRoot;

    address public owner;
    address public treeBuilder; // off-chain indexer service address

    // ----------------------------------------------------------------
    // Events
    // ----------------------------------------------------------------

    event Registered(uint256 indexed index, address indexed account, bytes32 commitment);
    event OwnershipRootUpdated(bytes32 root, uint256 registrationCount);
    event BalancesRootUpdated(bytes32 root, uint256 snapshotBlock);
    event TreeBuilderUpdated(address indexed oldBuilder, address indexed newBuilder);

    // ----------------------------------------------------------------
    // Modifiers
    // ----------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyTreeBuilder() {
        require(msg.sender == treeBuilder, "Not tree builder");
        _;
    }

    // ----------------------------------------------------------------
    // Constructor
    // ----------------------------------------------------------------

    constructor(address _treeBuilder) {
        owner = msg.sender;
        treeBuilder = _treeBuilder;
    }

    // ----------------------------------------------------------------
    // Registration
    // ----------------------------------------------------------------

    /// @notice Register a voter commitment.  Each address may register once.
    /// @param commitment Poseidon hash of the voter's secret.
    function register(bytes32 commitment) external {
        require(!isRegistered[msg.sender], "Already registered");
        require(commitment != bytes32(0), "Invalid commitment");

        uint256 index = registrations.length;
        registrations.push(Registration(msg.sender, commitment));
        isRegistered[msg.sender] = true;

        emit Registered(index, msg.sender, commitment);
    }

    // ----------------------------------------------------------------
    // Tree root management (called by off-chain tree builder)
    // ----------------------------------------------------------------

    /// @notice Submit a new ownership Merkle root.
    /// @param root        The Merkle root of the ownership tree.
    /// @param regCount    Must match the current registration count to
    ///                    prevent stale submissions.
    function submitOwnershipRoot(bytes32 root, uint256 regCount) external onlyTreeBuilder {
        require(root != bytes32(0), "Invalid root");
        require(regCount == registrations.length, "Count mismatch");

        knownOwnershipRoots[root] = true;
        latestOwnershipRoot = root;
        emit OwnershipRootUpdated(root, regCount);
    }

    /// @notice Submit a new balances Merkle root.
    /// @param root          The Merkle root of the balances tree.
    /// @param snapshotBlock The block number at which the balances snapshot
    ///                      was taken.
    function submitBalancesRoot(bytes32 root, uint256 snapshotBlock) external onlyTreeBuilder {
        require(root != bytes32(0), "Invalid root");
        require(snapshotBlock > 0, "Invalid block");

        balancesRootBlock[root] = snapshotBlock;
        latestBalancesRoot = root;
        emit BalancesRootUpdated(root, snapshotBlock);
    }

    // ----------------------------------------------------------------
    // Admin
    // ----------------------------------------------------------------

    /// @notice Transfer the tree-builder role to a new address.
    function setTreeBuilder(address _treeBuilder) external onlyOwner {
        emit TreeBuilderUpdated(treeBuilder, _treeBuilder);
        treeBuilder = _treeBuilder;
    }

    // ----------------------------------------------------------------
    // View helpers
    // ----------------------------------------------------------------

    function getRegistrationCount() external view returns (uint256) {
        return registrations.length;
    }

    function getRegistration(uint256 index) external view returns (address account, bytes32 commitment) {
        Registration storage reg = registrations[index];
        return (reg.account, reg.commitment);
    }

    function isKnownOwnershipRoot(bytes32 root) external view override returns (bool) {
        return knownOwnershipRoots[root];
    }

    function isKnownBalancesRoot(bytes32 root) external view override returns (bool) {
        return balancesRootBlock[root] > 0;
    }
}
