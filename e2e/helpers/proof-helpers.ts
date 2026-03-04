/**
 * Mock proof data generator for E2E tests.
 *
 * Since we use the MockVerifier (always returns true), we do not need
 * real Groth16 proofs. This module generates dummy proof data that
 * matches the Solidity verifier's expected parameter shapes:
 *   pA: uint256[2]
 *   pB: uint256[2][2]
 *   pC: uint256[2]
 */

/**
 * Generate a dummy Groth16 proof with valid structure but meaningless values.
 *
 * The values are non-zero to avoid any edge-case zero-checks in the future,
 * but they are completely synthetic. The MockVerifier accepts them regardless.
 */
export function generateDummyProof(): {
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
} {
  return {
    pA: ["1", "2"],
    pB: [
      ["3", "4"],
      ["5", "6"],
    ],
    pC: ["7", "8"],
  };
}
