// Тестовое поле под лагерем: скрытый проход в камне (стена между хабом и полем), две нажимные плиты (старт и стоп спавна врагов)
// и сетка на земле. Консоль разработчика стоит в углу поля (её добавляет Hub). Координаты местные, как у хаба: +z вниз по экрану.
// Снаружи: TestField.group, step(lx, lz) -> 'start' | 'stop' | null (по шагу логики), update(dt, lx, lz) (кадр), wallBlocks().
import * as THREE from 'three';

function mat(color, rough = 0.95) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, flatShading: true }); }
function addMat(map, color, opacity) {
  return new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}
function tex(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const soft = () => tex((g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});

/** Руна на камне прохода: кольцо и три угловатых знака. */
function runeTexture() {
  return tex((g, s) => {
    g.translate(s / 2, s / 2);
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.arc(0, 0, s * 0.4, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 3; i++) {
      g.save(); g.rotate(i * Math.PI * 2 / 3);
      g.beginPath(); g.moveTo(0, -s * 0.12); g.lineTo(s * 0.08, -s * 0.28); g.lineTo(-s * 0.08, -s * 0.28); g.closePath(); g.stroke();
      g.restore();
    }
    g.beginPath(); g.arc(0, 0, s * 0.07, 0, Math.PI * 2); g.stroke();
  }, 256);
}

/** Нажимная плита: каменное кольцо, внутри подвижный диск с знаком (▶ старт, ■ стоп) и мягким свечением. */
class Plate {
  constructor(x, z, color, glyph, r) {
    this.x = x; this.z = z; this.r = r;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.k = 0;      // 0 поднята, 1 вдавлена
    this.active = 0; // 0..1: плита «включена» (спавн идёт для старта; для стопа не горит)
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.25, r + 0.4, 0.22, 10), mat(0x3b465e));
    ring.position.y = 0.11;
    this.group.add(ring);
    this.pad = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.16, 10), mat(0x232b3f, 0.8));
    disc.position.y = 0.2;
    this.pad.add(disc);
    const gt = tex((g, s) => {
      g.translate(s / 2, s / 2); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 6;
      g.beginPath(); g.arc(0, 0, s * 0.44, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      if (glyph === 'play') { g.moveTo(-s * 0.13, -s * 0.2); g.lineTo(s * 0.22, 0); g.lineTo(-s * 0.13, s * 0.2); g.closePath(); }
      else g.rect(-s * 0.17, -s * 0.17, s * 0.34, s * 0.34);
      g.fill();
    }, 256);
    this.glyphMat = addMat(gt, color, 0.5);
    const glyphMesh = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.9, r * 1.9), this.glyphMat);
    glyphMesh.rotation.x = -Math.PI / 2; glyphMesh.position.y = 0.3;
    this.pad.add(glyphMesh);
    this.group.add(this.pad);
    this.haloMat = addMat(soft(), color, 0.3);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(r * 5, r * 5), this.haloMat);
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.04;
    this.group.add(halo);
  }
  hit(lx, lz) { return Math.hypot(lx - this.x, lz - this.z) < this.r; }
  update(dt, pressed, t) {
    this.k += ((pressed ? 1 : 0) - this.k) * (1 - Math.exp(-dt / 0.06));
    this.pad.position.y = -0.12 * this.k;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + this.x);
    this.glyphMat.opacity = 0.4 + 0.15 * pulse + 0.4 * this.k + 0.25 * this.active;
    this.haloMat.opacity = 0.2 + 0.1 * pulse + 0.4 * this.k + 0.3 * this.active;
  }
}

export class TestField {
  /** cfg: CONFIG.hub */
  constructor(cfg) {
    this.cfg = cfg;
    this.group = new THREE.Group();
    this.t = 0;
    this.open = false;     // камень отодвинут (остаётся открытым до перезагрузки страницы)
    this.k = 0;            // 0 закрыт, 1 открыт (плавно)
    this.spawning = false; // идёт ли спавн (его включает игра)
    this.pressed = { start: false, stop: false };
    const z0 = cfg.halfD, D = cfg.testD, hw = cfg.halfW;

    // Сетка на земле: ячейки 2 м, подсветка поля в холодных тонах.
    const gt = tex((g, s) => {
      g.fillStyle = 'rgba(40,110,190,0.10)'; g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(110,200,255,0.55)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s);
    }, 64);
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
    gt.repeat.set(hw, D / 2);
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, D), new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0.5, depthWrite: false }));
    grid.rotation.x = -Math.PI / 2;
    grid.position.set(0, 0.02, z0 + D / 2);
    this.group.add(grid);

    // Плиты: слева старт, справа стоп.
    this.startPlate = new Plate(cfg.plateStartX, z0 + cfg.plateDz, 0x59ffa6, 'play', cfg.plateR);
    this.stopPlate = new Plate(cfg.plateStopX, z0 + cfg.plateDz, 0xff6a5a, 'stop', cfg.plateR);
    this.group.add(this.startPlate.group, this.stopPlate.group);

    // Камни: боковые стены и дальний край поля (верхний край поля это нижняя стена хаба).
    const rockMat = mat(0x4a5873), rockDark = mat(0x3a4660);
    let n = 100;
    const rock = (x, z) => {
      const i = n++;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), i % 3 ? rockMat : rockDark);
      const s = 0.55 + 0.45 * Math.abs(Math.sin(i * 12.9));
      r.scale.set(s * 1.1, s * (0.7 + 0.5 * Math.abs(Math.cos(i * 7.3))), s);
      r.position.set(x, s * 0.35, z);
      r.rotation.set(i, i * 1.7, 0);
      this.group.add(r);
    };
    const st = cfg.rockStep;
    for (let z = z0 + st; z <= z0 + D; z += st) { rock(-hw, z); rock(hw, z); }
    for (let x = -hw + st; x < hw; x += st) rock(x, z0 + D);

    // Скрытый проход: крупный валун в просвете нижней стены хаба, на нём едва заметная руна.
    const gx = cfg.gateX;
    this.stone = new THREE.Group();
    this.stone.position.set(gx, 0, z0);
    const big = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockDark);
    big.scale.set(cfg.gateHalf * 1.05, 1.9, 1.55);
    big.position.y = 1.0; big.rotation.set(0.3, 0.6, 0.1);
    const small = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
    small.scale.set(0.9, 0.8, 0.9); small.position.set(-cfg.gateHalf * 0.8, 0.4, 0.9); small.rotation.set(1, 2, 0);
    this.stone.add(big, small);
    this.runeMat = addMat(runeTexture(), 0xa98bff, 0.25);
    this.rune = new THREE.Sprite(this.runeMat);
    this.rune.scale.setScalar(1.6);
    this.rune.position.set(0, 1.25, 1.35);
    this.stone.add(this.rune);
    this.group.add(this.stone);
    this.doorMat = addMat(soft(), 0x7fc8ff, 0);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(cfg.gateHalf * 3.2, cfg.gateHalf * 3.2), this.doorMat);
    door.rotation.x = -Math.PI / 2; door.position.set(gx, 0.05, z0);
    this.group.add(door);

    this.gateBlock = { x: gx, z: z0, hx: cfg.gateHalf, hz: cfg.wallMargin };
  }

  /** Стены между хабом и полем с просветом под проход: прямоугольники для столкновений (местные координаты). */
  wallBlocks() {
    const c = this.cfg, w = c.halfW + 1, a = c.gateX - c.gateHalf, b = c.gateX + c.gateHalf;
    return [
      { x: (-w + a) / 2, z: c.halfD, hx: (a + w) / 2, hz: c.wallMargin },
      { x: (b + w) / 2, z: c.halfD, hx: (w - b) / 2, hz: c.wallMargin },
      this.gateBlock,
    ];
  }

  /** Шаг логики: открыть камень при приближении, поймать нажатие плит (по переднему фронту). */
  step(lx, lz) {
    const c = this.cfg;
    if (!this.open && Math.hypot(lx - c.gateX, lz - c.halfD) < c.gateOpenDist) this.open = true;
    const s = this.startPlate.hit(lx, lz), p = this.stopPlate.hit(lx, lz);
    let ev = null;
    if (s && !this.pressed.start) ev = 'start';
    else if (p && !this.pressed.stop) ev = 'stop';
    this.pressed.start = s; this.pressed.stop = p;
    return ev;
  }

  /** Кадр: камень уходит в землю, плиты вдавливаются, руны мерцают. */
  update(dt, lx, lz) {
    this.t += dt;
    const t = this.t;
    this.k += ((this.open ? 1 : 0) - this.k) * (1 - Math.exp(-dt / 0.45));
    if (this.k > 0.97) this.k = 1;
    if (this.k > 0.85) this.gateBlock.hx = 0; // проход свободен, когда камень почти ушёл
    const e = this.k * this.k * (3 - 2 * this.k);
    this.stone.position.y = -2.7 * e;
    this.stone.rotation.z = 0.12 * e;
    const flash = Math.sin(Math.min(1, this.k) * Math.PI);
    this.runeMat.opacity = (this.open ? 0.9 * flash : 0.22 + 0.1 * Math.sin(t * 1.6)) * (this.k > 0.97 ? 0 : 1);
    this.doorMat.opacity = 0.45 * e;
    this.startPlate.active = this.spawning ? 1 : 0;
    this.stopPlate.active = 0;
    this.startPlate.update(dt, this.startPlate.hit(lx, lz), t);
    this.stopPlate.update(dt, this.stopPlate.hit(lx, lz), t);
  }
}
