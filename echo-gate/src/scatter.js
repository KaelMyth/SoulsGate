// Детали земли из SoulsGate: сухие кусты-«кораллы» (рекурсивные ветви), камни с шапкой снега.
// Раскладка детерминированная по клеткам мира (хеш), поэтому поле бесконечное и всегда одинаковое.
// Экземпляры живут в тороидальной сетке вокруг героя: при переходе героя в новую клетку пересчитываются только края.
import * as THREE from 'three';

function hash(i, j, k) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mulberry(seed) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Склеить геометрии с цветом вершин в одну. */
function merge(parts) {
  const pos = [];
  const nor = [];
  const col = [];
  for (const { geo, color, matrix } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    g.computeVertexNormals();
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) col.push(color.r, color.g, color.b);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

const UP = new THREE.Vector3(0, 1, 0);
function seg(a, b, r0, r1, color) {
  const d = new THREE.Vector3().subVectors(b, a);
  const geo = new THREE.CylinderGeometry(r1, r0, d.length(), 4);
  const m = new THREE.Matrix4().compose(
    a.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), new THREE.Vector3(1, 1, 1));
  return { geo, color, matrix: m };
}

/** Сухой куст: ствол и рекурсивные ветви, как branch() в SoulsGate, но в 3D. */
function makeBush(seed, scale) {
  const rnd = mulberry(seed);
  const parts = [];
  const col = new THREE.Color(0x1a2335);
  const colTip = new THREE.Color(0x2c3a58);
  const branch = (p, dir, len, r, depth) => {
    const q = p.clone().addScaledVector(dir, len);
    parts.push(seg(p, q, r, r * 0.7, depth === 0 ? colTip : col));
    if (depth <= 0) return;
    const n = rnd() < 0.4 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const d = dir.clone();
      d.x += (rnd() - 0.5) * 1.1;
      d.z += (rnd() - 0.5) * 1.1;
      d.y += 0.15;
      d.normalize();
      branch(q, d, len * 0.72, r * 0.7, depth - 1);
    }
  };
  branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3).normalize(), 0.34 * scale, 0.032 * scale, 3);
  return merge(parts);
}

/** Камень: приплюснутый многогранник и снежная шапка. */
function makeStone(seed) {
  const rnd = mulberry(seed);
  const parts = [];
  const body = new THREE.IcosahedronGeometry(0.3, 0);
  const pa = body.attributes.position;
  for (let i = 0; i < pa.count; i++) pa.setXYZ(i, pa.getX(i) * (0.9 + rnd() * 0.3), pa.getY(i) * (0.55 + rnd() * 0.2), pa.getZ(i) * (0.9 + rnd() * 0.3));
  parts.push({ geo: body, color: new THREE.Color(0x2b3550), matrix: new THREE.Matrix4().makeTranslation(0, 0.12, 0) });
  const cap = new THREE.IcosahedronGeometry(0.22, 0);
  parts.push({ geo: cap, color: new THREE.Color(0xc1cde2), matrix: new THREE.Matrix4().compose(new THREE.Vector3(-0.04, 0.2, 0.0), new THREE.Quaternion(), new THREE.Vector3(1.05, 0.38, 0.9)) });
  return merge(parts);
}

export class Scatter {
  constructor(scene, cfg) {
    this.cfg = cfg;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
    const W = (this.W = cfg.cells);
    this.slots = W * W;
    this.kinds = [
      { geo: makeBush(11, 1.0) }, { geo: makeBush(23, 1.35) }, { geo: makeBush(37, 0.8) },
      { geo: makeStone(5) }, { geo: makeStone(9) },
    ];
    this.meshes = this.kinds.map((k) => {
      const m = new THREE.InstancedMesh(k.geo, mat, this.slots);
      m.frustumCulled = false;
      m.count = this.slots;
      scene.add(m);
      return m;
    });
    this.ci = NaN;
    this.cj = NaN;
    this.tmp = new THREE.Object3D();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  place(ci, cj) {
    const c = this.cfg;
    const W = this.W;
    const slot = (((cj % W) + W) % W) * W + (((ci % W) + W) % W);
    const r = hash(ci, cj, 1);
    const cx = (ci + 0.5) * c.cell;
    const cz = (cj + 0.5) * c.cell;
    let kind = -1;
    if (r < c.bushes) kind = Math.floor(hash(ci, cj, 2) * 3);
    else if (r < c.bushes + c.stones) kind = 3 + Math.floor(hash(ci, cj, 3) * 2);
    // Вокруг старта чисто.
    if (Math.hypot(cx, cz) < c.clear) kind = -1;
    for (let k = 0; k < this.meshes.length; k++) {
      if (k !== kind) this.meshes[k].setMatrixAt(slot, this.zero);
    }
    if (kind < 0) return;
    const o = this.tmp;
    o.position.set(cx + (hash(ci, cj, 4) - 0.5) * c.cell * 0.8, 0, cz + (hash(ci, cj, 5) - 0.5) * c.cell * 0.8);
    o.rotation.set(0, hash(ci, cj, 6) * Math.PI * 2, 0);
    const sc = (kind < 3 ? 0.8 : 0.7) + hash(ci, cj, 7) * 0.6;
    o.scale.set(sc, sc * (kind < 3 ? 0.9 + hash(ci, cj, 8) * 0.4 : 1), sc);
    o.updateMatrix();
    this.meshes[kind].setMatrixAt(slot, o.matrix);
  }

  update(x, z) {
    const c = this.cfg;
    const ci = Math.floor(x / c.cell);
    const cj = Math.floor(z / c.cell);
    if (ci === this.ci && cj === this.cj) return;
    const h = this.W >> 1;
    const full = Number.isNaN(this.ci) || Math.abs(ci - this.ci) >= this.W || Math.abs(cj - this.cj) >= this.W;
    if (full) {
      for (let j = cj - h; j < cj - h + this.W; j++) for (let i = ci - h; i < ci - h + this.W; i++) this.place(i, j);
    } else {
      // Сдвиг: пересчитать вошедшие столбцы и строки.
      const di = ci - this.ci;
      const dj = cj - this.cj;
      for (let s = 1; s <= Math.abs(di); s++) {
        const i = di > 0 ? this.ci + s + h - 1 : this.ci - s - h;
        for (let j = cj - h; j < cj - h + this.W; j++) this.place(i + (di > 0 ? 0 : 0), j);
      }
      for (let s = 1; s <= Math.abs(dj); s++) {
        const j = dj > 0 ? this.cj + s + h - 1 : this.cj - s - h;
        for (let i = ci - h; i < ci - h + this.W; i++) this.place(i, j);
      }
    }
    this.ci = ci;
    this.cj = cj;
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
