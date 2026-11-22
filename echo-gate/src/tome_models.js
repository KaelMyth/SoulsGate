// Модели фолианта по ступени заточки: 0 потрёпанный (+0..4), 1 добротный (+5..9), 2 роскошный (+10).
// Общий строитель для руки героя, кузни и иконок. Центр модели в середине книги, лицо смотрит в +z; размер книги 0.27 x 0.36 x 0.085.
// Снаружи: buildTomeModel(tier, glowTex) -> { group, update(t, en) }, TOME_TIER_NAMES.
import * as THREE from 'three';

export const TOME_TIER_NAMES = ['Worn', 'Fine', 'Superb'];

const LOOK = [
  { cover: 0x4b3829, gold: 0, rune: 0x6fa8b8, runeOp: 0.35, glow: 0.14, glowC: 0x6fb7c9 },
  { cover: 0x3a2a5d, gold: 0xc9a25a, rune: 0x4fd8ff, runeOp: 0.75, glow: 0.35, glowC: 0x4fd8ff },
  { cover: 0x171442, gold: 0xffd36b, rune: 0x9ff6ff, runeOp: 1, glow: 0.7, glowC: 0x7ff0ff },
];

function runeTexture(tier) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.shadowColor = '#ffffff'; g.shadowBlur = 12;
  g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(64, 28); g.lineTo(90, 64); g.lineTo(64, 100); g.lineTo(38, 64); g.closePath(); g.stroke();
  if (tier >= 1) { g.beginPath(); g.moveTo(64, 10); g.lineTo(64, 118); g.moveTo(10, 64); g.lineTo(118, 64); g.stroke(); }
  if (tier >= 2) { g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 6, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function box(w, h, d, m, x, y, z, p) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  p.add(b);
  return b;
}

export function buildTomeModel(tier, glowTex) {
  const L = LOOK[Math.max(0, Math.min(2, tier))];
  const g = new THREE.Group();
  const W = 0.27, H = 0.36, T = 0.085;
  const cover = new THREE.MeshStandardMaterial({ color: L.cover, roughness: tier ? 0.65 : 0.95, flatShading: true });
  const pages = new THREE.MeshStandardMaterial({ color: tier ? 0xe9e2cf : 0xcfc3a3, roughness: 0.95 });
  const gold = L.gold ? new THREE.MeshStandardMaterial({ color: L.gold, roughness: 0.35, metalness: 0.65, flatShading: true }) : null;
  box(W, H, T, cover, 0, 0, 0, g);
  box(W - 0.03, H - 0.03, T - 0.03, pages, 0.012, 0, 0, g);
  box(0.035, H + 0.01, T + 0.012, cover, -W / 2, 0, 0, g); // корешок
  const face = T / 2;
  if (tier === 0) { // потрёпанный: ремешок, заплатка, перекошенные страницы
    const strap = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 1 });
    box(0.03, H + 0.012, T + 0.014, strap, 0.05, 0, 0, g);
    box(0.07, 0.06, 0.008, new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 1 }), -0.05, -0.1, face + 0.003, g);
    const sheet = box(W - 0.05, H - 0.05, 0.02, pages, 0.02, -0.01, 0.0, g); sheet.rotation.z = 0.05;
  } else {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) box(tier === 2 ? 0.065 : 0.05, tier === 2 ? 0.065 : 0.05, T + 0.014, gold, sx * (W / 2 - 0.02), sy * (H / 2 - 0.02), 0, g);
    for (const y of [-0.11, 0, 0.11]) box(0.04, 0.012, T + 0.018, gold, -W / 2, y, 0, g); // золотые пояса на корешке
    if (tier === 1) box(0.025, 0.06, T + 0.02, gold, W / 2, 0, 0, g); // застёжка
  }
  if (tier === 2) { // роскошный: золотая рамка на обложке и крупный камень над руной
    for (const sy of [-1, 1]) box(W - 0.07, 0.012, 0.008, gold, 0, sy * (H / 2 - 0.035), face + 0.003, g);
    for (const sx of [-1, 1]) box(0.012, H - 0.07, 0.008, gold, sx * (W / 2 - 0.035), 0, face + 0.003, g);
  }
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), new THREE.MeshBasicMaterial({ map: runeTexture(tier), color: L.rune, transparent: true, opacity: L.runeOp, blending: THREE.AdditiveBlending, depthWrite: false }));
  rune.position.z = face + 0.006;
  g.add(rune);
  let gem = null;
  if (tier === 2) {
    gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), new THREE.MeshStandardMaterial({ color: 0x9ff6ff, emissive: 0x4fe8ff, emissiveIntensity: 1.2, flatShading: true }));
    gem.scale.set(1, 1.4, 1);
    gem.position.z = face + 0.03;
    g.add(gem);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: L.glowC, transparent: true, opacity: L.glow, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(tier === 2 ? 0.85 : 0.5, tier === 2 ? 0.85 : 0.5, 1);
  glow.position.z = face + 0.02;
  g.add(glow);
  const orbit = [];
  if (tier === 2) { // вокруг книги кружат светящиеся руны
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xaef8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.set(0.07, 0.07, 1);
      g.add(s);
      orbit.push(s);
    }
  }
  return {
    group: g,
    update(t, en = 0.5) {
      glow.material.opacity = L.glow * (0.8 + 0.2 * Math.sin(t * 2.2)) * (0.8 + 0.4 * en);
      if (gem) gem.rotation.y = t * 1.6;
      orbit.forEach((s, i) => {
        const a = t * 1.2 + (i / orbit.length) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.3, Math.sin(a * 1.3) * 0.2, Math.sin(a) * 0.18 + 0.05);
      });
    },
  };
}
