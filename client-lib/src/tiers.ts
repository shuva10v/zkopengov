/**
 * Balance tier determination for ZK private voting.
 *
 * Voters are categorized into tiers based on their DOT balance. Each tier
 * has a voting weight. The tier boundaries and weights are public and must
 * match the circuit's tier verification logic.
 *
 * 1 DOT = 10^10 plancks.
 */

import { TierInfo } from './types';

/**
 * Tier definitions. All balances are in plancks.
 *
 * Tier 0:  1 - 100 DOT       (weight 1)
 * Tier 1:  100 - 1,000 DOT   (weight 3)
 * Tier 2:  1,000 - 10,000 DOT  (weight 6)
 * Tier 3:  10,000 - 100,000 DOT (weight 10)
 * Tier 4:  100,000+ DOT      (weight 15)  -- max is 2^128
 */
export const TIERS: TierInfo[] = [
    { id: 0, min: 10_000_000_000n, max: 1_000_000_000_000n, weight: 1 },
    { id: 1, min: 1_000_000_000_000n, max: 10_000_000_000_000n, weight: 3 },
    { id: 2, min: 10_000_000_000_000n, max: 100_000_000_000_000n, weight: 6 },
    { id: 3, min: 100_000_000_000_000n, max: 1_000_000_000_000_000n, weight: 10 },
    { id: 4, min: 1_000_000_000_000_000n, max: BigInt('340282366920938463463374607431768211456'), weight: 15 },
];

/**
 * Determine which tier a balance falls into.
 *
 * @param balance - Balance in plancks
 * @returns The matching TierInfo
 * @throws If the balance does not fall into any tier (e.g., below minimum)
 */
export function determineTier(balance: bigint): TierInfo {
    for (const tier of TIERS) {
        if (balance >= tier.min && balance < tier.max) {
            return tier;
        }
    }
    throw new Error(
        `Balance ${balance.toString()} does not fall into any tier. ` +
        `Minimum required: ${TIERS[0].min.toString()} plancks (1 DOT).`
    );
}

/**
 * Pack tier config for the circuit: tierMin * 2^128 + tierMax.
 *
 * The circuit expects a single packed field element encoding both the
 * minimum and maximum of the tier for efficient range checking.
 *
 * @param tier - The tier info to pack
 * @returns Packed tier config as a bigint
 */
export function packTierConfig(tier: TierInfo): bigint {
    const shift = 1n << 128n;
    return tier.min * shift + tier.max;
}
