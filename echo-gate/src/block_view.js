// Щит блока вокруг героя: широкий мягкий голубой купол без жёсткой кромки (светится к краям), накрывает героя вместе
// со шляпой. Появляется плавно, в конце блока гаснет, при парировании вспыхивает. Только рисование, логика в block.js.
import * as THREE from 'three';

const VERT = `varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const FRAG = `uniform vec3 uColor; uniform float uA; varying vec3 vN; varying vec3 vV;
void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = uA * (0.14 + 0.5 * pow(f, 2.0));
  gl_FragColor = vec4(uColor, a); }`;

function softDisc() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.7, 'rgba(255,255,255,0.25)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class BlockView {
  constructor(scene) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x7fc0ff) }, uA: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), this.mat);
    this.floorMat = new THREE.MeshBasicMaterial({ map: softDisc(), color: 0x7fc0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), this.floorMat);
    this.floor.position.y = 0.02;
    this.group = new THREE.Group();
    this.group.add(this.dome, this.floor);
    this.group.visible = false;
    scene.add(this.group);
    this.k = 0;     // 0..1 появление
    this.flash = 0; // вспышка парирования
  }

  parry() { this.flash = 1; }

  update(dt, block, x, z, heroRadius) {
    const C = block.cfg;
    const target = block.active ? 1 : 0;
    this.k += (target - this.k) * Math.min(1, dt * (target ? 12 : 8));
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (this.k < 0.01 && this.flash <= 0) { this.group.visible = false; return; }
    const left = block.active ? Math.max(0, block.duration - block.t) : 0;
    const fade = block.active ? Math.min(1, left / 0.4) : 1; // последние 0.4 с гаснет
    const R = heroRadius * C.radiusScale;
    const s = R * (0.7 + 0.3 * this.k) * (1 + 0.06 * this.flash);
    this.group.visible = true;
    this.group.position.set(x, 0, z);
    this.dome.position.y = R * 0.8;
    this.dome.scale.set(s, s * 1.12, s);
    this.floor.scale.setScalar(s * 1.05);
    const a = this.k * fade;
    this.mat.uniforms.uA.value = a * (1 + 0.1 * Math.sin(block.t * 6)) + 1.2 * this.flash;
    this.floorMat.opacity = 0.35 * a + 0.3 * this.flash;
  }
}
