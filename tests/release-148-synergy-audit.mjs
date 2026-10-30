// Regression suite for releases 145-148.
// Run: node --experimental-default-type=module --test tests/release-148-synergy-audit.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { Game } from '../game.js';
import { Absorption } from '../systems_absorption.js';
import { Aura } from '../systems_aura.js';

const enemy = (x=100,y=0) => ({x,y,active:true,gen:1,radius:12,hp:1000});

function gridFor(core,mods) {
  const b=new BuildGrid(7);
  if(core==='projectile'||core==='shield') b.placeCore(core,CONFIG.cores[core],3,3);
  else {assert.equal(canPlace(b,CONFIG.mods[core],3,3).ok,true);b.placeMod({key:core,def:CONFIG.mods[core]},3,3);}
  for(const [key,x,y] of mods){
    const r=canPlace(b,CONFIG.mods[key],x,y);
    assert.equal(r.ok,true,key+' '+x+','+y+' '+r.reason);
    b.placeMod({key,def:CONFIG.mods[key]},x,y);
  }
  return b;
}

test('Laser source follows hero each tick, fixed phantom keeps source, blade laser follows blade',()=>{
  const hero={x:0,y:0,active:true};
  const foe=enemy(120,0);
  const g=Object.create(Game.prototype);
  g.config=CONFIG;g.hero=hero;g.enemies={items:[foe]};
  g.lasers=[];g.arena={segmentBlocked:()=>false};
  g.swarm={grid:{query(_x,_y,_r,buf){buf[0]=0;return 1;}}};
  g.rayE=[];g.rayT=[];g.laserTick=()=>{};
  const mk=(over={})=>({x:0,y:0,dx:1,dy:0,target:foe,age:0,life:4,interval:1,ticks:0,done:0,width:8,pierce:0,...over});
  const normal=mk();g.lasers=[normal];g.updateLasers(0.016);
  hero.x=40;hero.y=15;g.updateLasers(0.016);
  assert.equal(normal.x,40);assert.equal(normal.y,15);
  assert.ok(normal.dx>0);
  const fixed=mk({x:77,y:22,fixed:true});g.lasers=[fixed];hero.x=50;g.updateLasers(0.016);
  assert.equal(fixed.x,77);assert.equal(fixed.y,22);
  const anchor={x:22,y:12,state:'orbit'},blade=mk({anchor});
  g.lasers=[blade];g.updateLasers(0.016);assert.equal(blade.x,22);
  anchor.x=66;g.updateLasers(0.016);assert.equal(blade.x,66);
});

test('Laser + absorption is connected, triggers once per cooldown, and casts actual absorption',()=>{
  const b=gridFor('projectile',[['laser',3,4],['absorption',3,5]]);
  assert.equal(b.modifiersFor('projectile').laserAbsorption,true);
  const foe=enemy(120,0),g=Object.create(Game.prototype),casts=[];
  g.config=CONFIG;g.build=b;g.runTime=1;g.synergyCasts=[];g.synergyFlashes=[];
  g.laserAbsorptionCooldowns=new WeakMap();
  g.laserSource={};g.rayE=[foe];g.combat={damageEnemy:()=>true};
  const laser={hits:1,pierce:0,tick:3,gen:0,anchor:null,phantom:0,burnDmg:0,frost:false,zap:0,dx:1,dy:0};
  g.laserTick(laser);g.laserTick(laser);
  assert.equal(g.synergyCasts.length,1);
  assert.ok(g.synergyCasts[0].mods.absorption);
  g.absorption={source:{},strike(...args){casts.push(args);}};
  g.updateSynergyCasts(CONFIG.absorption.telegraph+0.01);
  assert.equal(casts.length,1);assert.equal(casts[0][0],foe);
  assert.equal(casts[0][2],1);
});

test('Laser+Aura and Shot+Aura work as shield synergies without triggering projectile modes',()=>{
  const b=gridFor('shield',[['aura',3,4],['laser',2,4],['shot',3,5]]);
  const m=b.modifiersFor('shield');
  assert.equal(m.auraLaser,true);assert.equal(m.auraShot,true);
  const foe=enemy(35,0),projectiles=[];
  const aura=new Aura({config:CONFIG,hero:{x:0,y:0,active:true},
    enemies:{items:[foe]},modifiers:()=>m,combat:{damageEnemy:()=>true},
    grid:{buf:[0],query(){return 1}},rnd:()=>0.5});
  aura.pellets={n:0,add(...args){projectiles.push(args);this.n++;}};
  aura.update(4.01);
  assert.equal(aura.laserShimmer,true);
  assert.ok(aura.radius>CONFIG.aura.radius);
  assert.equal(projectiles.length,4);
});

test('Pierce+Absorption hits nearby enemies, Phantom+Absorption is wired to the spell',()=>{
  const b=gridFor('shield',[['absorption',3,4],['pierce',3,5]]);
  const m=b.modifiersFor('shield');
  assert.equal(m.absorption.pierce,true);
  const primary=enemy(0,0),near=enemy(30,0),far=enemy(500,0),hits=[];
  const a=new Absorption({config:CONFIG,hero:{x:0,y:0,active:true,hp:50,maxHp:100},
    enemies:{items:[primary,near,far]},combat:{damageEnemy(e,d){hits.push([e,d]);return true;}}});
  a.strike(primary,m);
  assert.equal(hits.length,2);
  assert.equal(hits[0][1],CONFIG.absorption.damage);
  assert.equal(hits[1][1],CONFIG.absorption.damage*CONFIG.absorption.pierceDamageFrac);
  const phantom=gridFor('shield',[['absorption',3,4],['phantom',3,5]]);
  const pm=phantom.modifiersFor('shield');
  assert.equal(pm.absorption.phantom,true);
  let copied=0;a.onPhantom=()=>copied++;
  a.strike(primary,pm);assert.equal(copied,1);
  a.strike(primary,pm,0.5,true);assert.equal(copied,1);
});

test('Kinetic dash emits exactly five blades, three left/two right, X2 emits ten',()=>{
  for(const mult of [1,2]){
    const g=Object.create(Game.prototype);
    g.config=CONFIG;g.hero={x:0,y:0,active:true,dashing:true,glideTime:0};
    g.defense={kinetic:true,dashSeq:1,kineticBladeDistanceMul:mult,dashX:1,dashY:0};
    g.lightdash={active:false};g.kineticMods={blades:{damage:1},bounces:{percent:(mult-1)*100}};
    g.kineticBlades=[];g.kineticBladeTrail=null;
    g.beginKineticBladeTrail();
    const distance=CONFIG.dash.distance*CONFIG.kinetic.distanceScale*mult;
    for(let i=1;i<=5;i++){g.hero.x=distance*i/5;g.spawnKineticBlades();}
    g.hero.dashing=false;g.spawnKineticBlades();
    assert.equal(g.kineticBlades.length,5*mult);
    assert.equal(g.kineticBlades.filter(b=>b.vy>0).length,3*mult);
    assert.equal(g.kineticBlades.filter(b=>b.vy<0).length,2*mult);
    assert.equal(g.kineticBladeTrail,null);
  }
});

test('Rain+Gravity slows for five seconds and Rain+Blades damages every live enemy',()=>{
  const b=gridFor('rain',[['gravity',2,3],['blades',3,4]]);
  const m=b.modifiersFor(b.secondaryId('rain'));
  assert.ok(m.gravity&&m.blades);
  const enemies=[enemy(),enemy(200,0)],hits=[];
  const g=Object.create(Game.prototype);
  g.config=CONFIG;g.build=b;g.state='playing';g.hero={active:true};
  g.skillCd=[0,0,0];g.hud={};g.enemies={items:enemies};
  g.combat={damageEnemy(e,d){hits.push([e,d]);return true;}};
  assert.equal(g.castRain(),true);
  assert.deepEqual(hits.map(x=>x[1]),[50,50]);
  assert.ok(enemies.every(e=>e.vuln===true&&e.rainGravityT===5));
  assert.equal(g.hud.rainBlades,true);
});
