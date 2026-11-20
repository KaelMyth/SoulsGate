// Death loot is escrowed until the player explicitly leaves or finishes a rewarded ad.
// Five sharpening gems are a temporary prototype reward (one item per inventory slot).
import { pearlGem } from './items.js';

export const DEMO_DEATH_GEMS = 5;

export function captureDeathLoot(rewards = {}, collected = {}) {
  return {
    spirit: Math.max(0, Math.floor(Number(rewards.spirit) || 0)),
    gold: Math.max(0, Math.floor(Number(rewards.gold) || 0)),
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
  inventory.addSpirit(lost.spirit);
  inventory.addCoins(lost.gold);
  return true;
}
