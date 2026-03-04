interface TierBadgeProps {
    tier: number;
    showWeight?: boolean;
}

interface TierDefinition {
    label: string;
    range: string;
    color: string;
    weight: number;
}

const TIER_DEFS: TierDefinition[] = [
    { label: 'Minnow', range: '1-100 DOT', color: '#95a5a6', weight: 1 },
    { label: 'Dolphin', range: '100-1K DOT', color: '#4361ee', weight: 3 },
    { label: 'Shark', range: '1K-10K DOT', color: '#2ecc71', weight: 6 },
    { label: 'Whale', range: '10K-100K DOT', color: '#9b59b6', weight: 10 },
    { label: 'Megalodon', range: '100K+ DOT', color: '#f1c40f', weight: 15 },
];

export default function TierBadge({ tier, showWeight = true }: TierBadgeProps) {
    const def = TIER_DEFS[tier] || TIER_DEFS[0];

    return (
        <div className="tier-badge" style={{ borderColor: def.color }}>
            <div className="tier-badge-header" style={{ backgroundColor: def.color }}>
                <span className="tier-badge-number">Tier {tier}</span>
                <span className="tier-badge-label">{def.label}</span>
            </div>
            <div className="tier-badge-body">
                <span className="tier-badge-range">{def.range}</span>
                {showWeight && (
                    <span className="tier-badge-weight">
                        Weight: <strong>{def.weight}x</strong>
                    </span>
                )}
            </div>
        </div>
    );
}

export { TIER_DEFS };
