// SoulsGate #158: визуальный аудит комбинаций 12–19.
 // node --experimental-default-type=module --test tests/release-158-synergy-vfx.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../render_renderer.js';
import { DashFx } from '../render_dashfx.js';
import { HitFx } from '../render_hitfx.js';

function makeCtx() {
  const counts={stroke:0,fill:0,image:0};
  return {
    counts,globalAlpha:1,globalCompositeOperation:'source-over',
    save(){},restore(){},translate(){},rotate(){},scale(){},
    beginPath(){},closePath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},bezierCurveTo(){},
    arc(){},ellipse(){},fill(){counts.fill++},stroke(){counts.stroke++},
    drawImage(){counts.image++},
    createLinearGradient(){return{addColorStop(){}}},createRadialGradient(){return{addColorStop(){}}},
    clip(){},rect(){},fillRect(){},strokeRect(){},setLineDash(){},
  };
}

function makeRenderer() {
  const r=Object.create(Renderer.prototype);
  r.clock=2.25;
  r.hero={active:true,x:85,y:64,radius:12};
  r.enemies={items:[{active:true,x:120,y:70,radius:10,gen:1},{active:true,x:148,y:80,radius:12,gen:2}]};
  r.getGlow=()=>({width:64,height:64});
  r.getPuff=()=>({width:64,height:64});
  return r;
}

test('№12: laser-chain transitions produce separate charging and hop effects',()=>{
  const r=makeRenderer(),ctx=makeCtx();
  r.lightdash={active:true,laserMode:true,idx:0,phase:'charge',kind:0,
    route:[{x:180,y:64}],bolts:[]};
  r.hero.dashing=true;r.hero.glideTime=0;r.hero.vx=0;r.hero.vy=0;
  r.cfg={kinetic:{beamTime:0.2}};
  r.dashKinetic=true;
  const fx=new DashFx(r,180);
  fx.frame(ctx,0.016,85,64);
  const charging=fx.p.filter(q=>q.on).length;
  r.lightdash.phase='hop';
  fx.frame(ctx,0.016,93,64);
  assert.equal(fx.lightPhase,'hop');
  assert.ok(fx.p.filter(q=>q.on).length>charging);
});

test('№13: kinetic-shot burst has dual shock arcs and focused emission',()=>{
  const fx=new HitFx({},80);
  fx.spawn({kind:'spray',el:0,x:30,y:40,dx:1,dy:0,power:0});
  const types=fx.p.filter(p=>p.on).map(p=>p.type);
  assert.ok(types.includes(13),'shock arcs');
  assert.ok(types.includes(12),'emission cones');
  assert.ok(types.includes(10),'speed filaments');
});

test('№14–17: distinct absorption effects render under the same canvas contract',()=>{
  const r=makeRenderer(),ctx=makeCtx();
  r.drawAbsorptionCompression(ctx,50,60,23,0.7,0);
  r.drawBladeAbsorptionSigil(ctx,50,60,23,0.55,2);
  r.absorption={auraConnected:true,auraPeriod:2,auraTimer:0.2};
  r.drawAuraAbsorptionLinks(ctx,85,64,150,r.clock);
  r.drawVampiricReturn(ctx,{x:200,y:100},0.6,0);
  assert.ok(ctx.counts.stroke>=20);
  assert.ok(ctx.counts.fill>=1);
  assert.ok(ctx.counts.image>0);
  const marker=Renderer.prototype.drawAbsorptionMarker.toString();
  assert.ok(marker.includes('bladeCounters.get'));
  assert.ok(marker.includes('drawAbsorptionCompression'));
  assert.ok(marker.includes('drawBladeAbsorptionSigil'));
  assert.ok(Renderer.prototype.drawAura.toString().includes('drawAuraAbsorptionLinks'));
  assert.ok(Renderer.prototype.drawAbsorptionFlash.toString().includes('drawVampiricReturn'));
});

test('№18–19: phantom materialization and piercing remnants have independent paths',()=>{
  const r=makeRenderer(),ctx=makeCtx();
  r.drawPhantomConjuring(ctx,70,90,18,0.45,2);
  r.drawPierceTrail(ctx,80,90,0.2,12,0.8,0);
  assert.ok(ctx.counts.stroke>=7);
  assert.ok(ctx.counts.image>0);
  assert.ok(Renderer.prototype.drawShots.toString().includes('p.gen > 0'));
  assert.ok(Renderer.prototype.drawShots.toString().includes('p.hits?.length'));
  assert.ok(Renderer.prototype.drawLasers.toString().includes('drawPhantomConjuring'));
  assert.ok(Renderer.prototype.drawBlades.toString().includes('drawPierceTrail'));
});
