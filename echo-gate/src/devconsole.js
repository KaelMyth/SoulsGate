// Консоль разработчика в углу хаба: стойка с мигающими огоньками и стол с наклонным экраном, на экране бежит зелёный текст.
// Собрана из примитивов Three.js, центр у земли в (0,0,0), лицом к камере (+z), размер примерно 3,6x2,6 м.
// Снаружи: DevConsole.group и DevConsole.update(dt).
import * as THREE from 'three';

function mat(color, rough = 0.85, extra) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.15, flatShading: true, ...extra });
}
function box(w, h, d, m, x, y, z) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  return b;
}

const LINES = ['> boot dev_console v0.9', '> staffs.load(all)', '> tiers: +1 +5 +10', '> ready_', '> equip --force', '> sharpen +10 ok', '> spawn blizzard 4', '> _'];

export class DevConsole {
  constructor() {
    this.group = new THREE.Group();
    this.t = 0;
    const steel = mat(0x2b3448), steelL = mat(0x3d4963), dark = mat(0x161c2b);
    const green = 0x5dffa0;

    // Плита-основание с подсвеченной кромкой.
    this.group.add(box(3.6, 0.1, 2.6, dark, 0, 0.05, 0));
    const edge = new THREE.MeshBasicMaterial({ color: green });
    this.group.add(box(3.6, 0.03, 0.05, edge, 0, 0.11, 1.28), box(3.6, 0.03, 0.05, edge, 0, 0.11, -1.28));

    // Стол-тумба и клавиатура.
    this.group.add(box(2.0, 0.85, 0.95, steel, -0.3, 0.52, 0.2));
    this.group.add(box(2.1, 0.07, 1.05, steelL, -0.3, 0.98, 0.2));
    const kb = box(1.1, 0.05, 0.38, dark, -0.3, 1.04, 0.5);
    kb.rotation.x = -0.12;
    this.group.add(kb);
    const keys = box(1.0, 0.02, 0.28, new THREE.MeshBasicMaterial({ color: 0x2f9f6a }), -0.3, 1.075, 0.5);
    keys.rotation.x = -0.12;
    this.group.add(keys);

    // Экран: рамка и наклонное стекло с текстом.
    const mon = new THREE.Group();
    mon.position.set(-0.3, 1.52, -0.05);
    mon.rotation.x = -0.18;
    mon.add(box(1.6, 0.98, 0.1, steel, 0, 0, 0));
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256; this.canvas.height = 160;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 0.86), new THREE.MeshBasicMaterial({ map: this.tex }));
    screen.position.z = 0.056;
    mon.add(screen);
    mon.add(box(0.14, 0.45, 0.14, steelL, 0, -0.7, -0.05)); // шея
    this.group.add(mon);
    this.mon = mon;

    // Мягкое зелёное свечение перед экраном.
    const gc = document.createElement('canvas');
    gc.width = gc.height = 64;
    const g = gc.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(93,255,160,0.55)');
    gr.addColorStop(1, 'rgba(93,255,160,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const gt = new THREE.CanvasTexture(gc);
    gt.colorSpace = THREE.SRGBColorSpace;
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.position.set(-0.3, 0.13, 1.1);
    this.group.add(this.glow);

    // Стойка с сервером справа: светодиоды мигают.
    this.group.add(box(0.8, 1.9, 0.8, steel, 1.25, 1.0, -0.3));
    this.leds = [];
    for (let r = 0; r < 5; r++) {
      this.group.add(box(0.66, 0.2, 0.04, dark, 1.25, 0.5 + r * 0.32, 0.12));
      for (let c = 0; c < 3; c++) {
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: green }));
        led.position.set(1.05 + c * 0.1, 0.5 + r * 0.32, 0.15);
        led.userData = { ph: r * 1.7 + c * 0.9, col: (r + c) % 4 === 0 ? 0xffb14a : green };
        this.group.add(led);
        this.leds.push(led);
      }
    }
    // Антенна с красным огоньком.
    this.group.add(box(0.05, 0.8, 0.05, steelL, 1.5, 2.3, -0.5));
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4a55 }));
    this.beacon.position.set(1.5, 2.75, -0.5);
    this.group.add(this.beacon);

    // Ящик с кабелями на земле и табличка.
    this.group.add(box(0.7, 0.5, 0.6, mat(0x4a546c), -1.55, 0.35, 0.7));
    const sign = box(1.2, 0.3, 0.05, mat(0x10151f), -0.3, 0.5, 0.72);
    this.group.add(sign);
    this.group.add(box(1.1, 0.03, 0.02, edge, -0.3, 0.5, 0.75));

    this.draw(0);
  }

  draw(t) {
    const g = this.ctx;
    g.fillStyle = '#04110a';
    g.fillRect(0, 0, 256, 160);
    g.font = '13px monospace';
    g.fillStyle = '#5dffa0';
    const shown = Math.floor(t * 1.4) % (LINES.length + 5);
    for (let i = 0; i < Math.min(LINES.length, shown + 1); i++) {
      g.globalAlpha = 0.75 + 0.25 * (i === shown);
      g.fillText(LINES[i], 10, 22 + i * 17);
    }
    g.globalAlpha = 1;
    if (Math.floor(t * 2) % 2 === 0) g.fillRect(10 + (shown < LINES.length ? LINES[shown].length * 7.8 : 0), 12 + Math.min(shown, LINES.length - 1) * 17 + 17 * (shown < LINES.length ? 0 : 1), 8, 14);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 160; y += 3) g.fillRect(0, y, 256, 1); // строчки
    this.tex.needsUpdate = true;
  }

  update(dt) {
    this.t += dt;
    this.acc = (this.acc || 0) + dt;
    if (this.acc >= 0.25) { this.acc = 0; this.draw(this.t); }
    for (const l of this.leds) {
      const on = Math.sin(this.t * 3 + l.userData.ph) > -0.2;
      l.material.color.setHex(on ? l.userData.col : 0x103020);
    }
    this.beacon.material.color.setHex(Math.sin(this.t * 4) > 0.2 ? 0xff4a55 : 0x501018);
    this.glow.material.opacity = 0.85 + 0.15 * Math.sin(this.t * 2.2);
  }
}
