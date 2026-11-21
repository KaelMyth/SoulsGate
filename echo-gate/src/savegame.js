// Echo Gate prototype saves. Export codes contain the entire persistent state;
// no server, account or cryptographic protection is involved.
import { Item, KINDS, RARITY, ELEMENTS } from './items.js';

export const SAVE_STORAGE_KEY = 'echo-gate-progress-v1';
export const SAVE_VERSION = 1;
const CODE_PREFIX = 'EG1';
const MAX_CODE_LENGTH = 200000;

const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (v, lo, hi) => Number.isSafeInteger(v) && v >= lo && v <= hi;

function packItem(item) {
  if (!item) return null;
  return {
    id: item.id, kind: item.kind, name: item.name, rarity: item.rarity,
    level: item.level, sharpen: item.sharpen, durability: item.durability,
    desc: item.desc, element: item.element,
  };
}

function unpackItem(raw) {
  if (raw === null) return null;
  if (!record(raw) || !integer(raw.id, 1, Number.MAX_SAFE_INTEGER)
    || !Object.hasOwn(KINDS, raw.kind) || !Object.hasOwn(RARITY, raw.rarity)
    || typeof raw.name !== 'string' || !raw.name.length || raw.name.length > 256
    || typeof raw.desc !== 'string' || raw.desc.length > 2048
    || !integer(raw.level, 1, 10000) || !integer(raw.sharpen, 0, 1000)
    || typeof raw.durability !== 'number' || !Number.isFinite(raw.durability)
    || raw.durability < 0 || raw.durability > 1
    || (raw.element !== null && !Object.hasOwn(ELEMENTS, raw.element))) {
    throw new Error('Invalid item in save');
  }
  return new Item({
    id: raw.id, kind: raw.kind, name: raw.name, rarity: raw.rarity,
    level: raw.level, sharpen: raw.sharpen, durability: raw.durability,
    desc: raw.desc, element: raw.element,
  });
}

export function captureProgress(inv) {
  return {
    type: 'echo-gate-progress',
    version: SAVE_VERSION,
    savedAt: Date.now(),
    souls: inv.souls,
    slots: inv.slots.map(packItem),
    equipped: { tome: packItem(inv.equipped.tome), staff: packItem(inv.equipped.staff) },
    broken: inv.broken.map(packItem),
    achievements: { ...inv.achievements },
  };
}

/** Fully validate before assigning anything to Inventory: invalid codes cannot wipe a save. */
export function validateProgress(raw, limit) {
  if (!record(raw) || raw.type !== 'echo-gate-progress' || raw.version !== SAVE_VERSION)
    throw new Error('Unsupported save version');
  if (!integer(raw.souls, 0, Number.MAX_SAFE_INTEGER)
    || !integer(limit, 1, 10000) || !Array.isArray(raw.slots)
    || raw.slots.length > limit || !record(raw.equipped)
    || !Array.isArray(raw.broken) || raw.broken.length > 1000)
    throw new Error('Invalid save data');
  if (raw.achievements !== undefined && !record(raw.achievements))
    throw new Error('Invalid achievements data');
  const seen = new Set();
  const item = (data) => {
    const out = unpackItem(data);
    if (out) {
      if (seen.has(out.id)) throw new Error('Duplicate item in save');
      seen.add(out.id);
    }
    return out;
  };
  const slots = raw.slots.map(item);
  while (slots.length < limit) slots.push(null);
  const equipped = { tome: item(raw.equipped.tome), staff: item(raw.equipped.staff) };
  if ((equipped.tome && equipped.tome.slot !== 'tome')
    || (equipped.staff && equipped.staff.slot !== 'staff'))
    throw new Error('Invalid equipped item in save');
  const broken = raw.broken.map(item);
  if (broken.includes(null)) throw new Error('Invalid broken item in save');
  const achievements = {};
  const entries = Object.entries(raw.achievements || {});
  if (entries.length > 300) throw new Error('Too many achievements in save');
  for (const [key, value] of entries) {
    if (key.length > 80 || !key.length || !/^[a-zA-Z0-9._-]+$/.test(key)
      || !(typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
        || (typeof value === 'string' && value.length <= 300)))
      throw new Error('Invalid achievement in save');
    Object.defineProperty(achievements, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return { souls: raw.souls, slots, equipped, broken, achievements };
}

function checksum(bytes) {
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

export function encodeSaveCode(progress) {
  const bytes = new TextEncoder().encode(JSON.stringify(progress));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return CODE_PREFIX + '.' + body + '.' + checksum(bytes);
}

export function decodeSaveCode(code, limit) {
  if (typeof code !== 'string') throw new Error('Paste a save code');
  const clean = code.replace(/\s+/g, '');
  if (clean.length > MAX_CODE_LENGTH) throw new Error('Save code is too long');
  const match = /^EG1\.([A-Za-z0-9_-]+)\.([0-9a-fA-F]{8})$/.exec(clean);
  if (!match) throw new Error('Invalid save code');
  try {
    const body = match[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(body);
    const bytes = Uint8Array.from(binary, (x) => x.charCodeAt(0));
    if (checksum(bytes) !== match[2].toLowerCase()) throw new Error('Save code was damaged');
    const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return validateProgress(raw, limit);
  } catch (error) {
    if (error.message === 'Save code was damaged') throw error;
    throw new Error('Invalid or incompatible save code');
  }
}
