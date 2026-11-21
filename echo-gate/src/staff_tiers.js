// Три ступени посоха по уровню заточки: до +4, +5..+9, +10. Ступень меняет вид и силу выстрела (числа в CONFIG.tiers).
// Силу выстрела Force задаёт CONFIG.tiers.force, у ледяного посоха ступени в CONFIG.ice.tiers (стаки до заморозки, шипы при смерти); у остальных стихийных числа добавим позже.
export function tierOf(cfg, sharpen) {
  const t = cfg.tiers.thresholds;
  return sharpen >= t[1] ? 2 : sharpen >= t[0] ? 1 : 0;
}

/** Описание выстрела Force при заточке sharpen: { name, size, damage, shots, halo, trail }. */
export function forceTier(cfg, sharpen) {
  return cfg.tiers.force[tierOf(cfg, sharpen)];
}
