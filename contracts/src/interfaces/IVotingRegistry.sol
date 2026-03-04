// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVotingRegistry {
    function isKnownOwnershipRoot(bytes32 root) external view returns (bool);
    function isKnownBalancesRoot(bytes32 root) external view returns (bool);
    function getProposalBlock(bytes32 proposalId) external view returns (uint256);
    function findBalancesRootForProposal(uint256 proposalBlock) external view returns (bytes32 root, uint256 snapshotBlock);
}
