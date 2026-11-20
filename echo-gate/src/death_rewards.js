// Death loot is escrowed until the player explicitly leaves or finishes a rewarded ad.
// Five sharpening gems are a temporary prototype reward (one item per inventory slot).
import { pearlGem } from './items.js';
import { computeSoulTally } from './soul_rewards.js';

export const DEMO_DEATH_GEMS = 5;

export function captureDeathLoot(rewards = {}, collected = {}, soulMods = {}) {
  return {
    souls: Math.max(0, Math.floor(Number(rewards.souls) || 0)),
    soulMods: { ...soulMods },
    collected: {
      power: Math.max(0, Math.floor(Number(collected.power) || 0)),
      skill: Math.max(0, Math.floor(Number(collected.skill) || 0)),
      page: Math.max(0, Math.floor(Number(collected.page) || 0)),
    },
    gems: Array.from({ length: DEMO_DEATH_GEMS }, () => pearlGem()),
  };
}

/** All-or-nothing bank for currencies and the five separate prototype gems. */
export function bankLostLoot(inventory, lost) {
  if (!lost || !Array.isArray(lost.gems) || inventory.limit - inventory.count < lost.gems.length) return false;
  for (const gem of lost.gems) inventory.add(gem);
  inventory.addSouls(computeSoulTally(lost.souls, lost.soulMods).total);
  return true;
}
