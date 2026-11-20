// Deterministic end-of-run soul payout. Round only when presenting a stage/final payout,
// so nine modifiers do not lose souls to intermediate rounding.
export const SOUL_TIERS = Object.freeze([
  { id: 'soul10', factor: 1.1, max: 5, tier: 'blue', label: 'SOUL HARVEST' },
  { id: 'soul50', factor: 1.5, max: 3, tier: 'gold', label: 'SOUL ASCENSION' },
  { id: 'soul100', factor: 2, max: 1, tier: 'red', label: 'SOUL ECLIPSE' },
]);

export function computeSoulTally(baseSouls, modifiers = {}) {
  const base = Number.isFinite(baseSouls) ? Math.max(0, Math.floor(baseSouls)) : 0;
  let value = base;
  let multiplier = 1;
  const stages = [{ tier: 'base', label: 'SOULS GATHERED', factor: 1, from: 0, to: base }];
  const counts = {};
  for (const mod of SOUL_TIERS) {
    const input = Number(modifiers[mod.id]);
    const count = Number.isFinite(input) ? Math.min(mod.max, Math.max(0, Math.floor(input))) : 0;
    counts[mod.id] = count;
    for (let n = 0; n < count; n++) {
      const before = value;
      value *= mod.factor;
      multiplier *= mod.factor;
      stages.push({
        tier: mod.tier, label: mod.label, factor: mod.factor,
        from: Math.round(before), to: Math.round(value),
      });
    }
  }
  return { base, total: Math.round(value), multiplier, stages, counts };
}
