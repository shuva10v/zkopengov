// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVotingRegistry {
    function isKnownOwnershipRoot(bytes32 root) external view returns (bool);
    function isKnownBalancesRoot(bytes32 root) external view returns (bool);
}
