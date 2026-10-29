// Общий контракт дерева модов: каждому эффекту принадлежит ближайший механический носитель.
// node --experimental-default-type=module --test tests/release-151-modifier-composition.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG} from '../config_game.js';
import {BuildGrid} from '../build_grid.js';
import {canPlace} from '../build_rules.js';
import {forCarrier} from '../build_scopes.js';
import {LightDash} from '../systems_lightdash.js';
import {Game} from '../game.js';

function composition() {
  const b = new BuildGrid(7);
  const put = (key,x,y) => {
    const place = canPlace(b,CONFIG.mods[key],x,y);
    assert.equal(place.ok,true,key+' '+place.reason);
    b.placeMod({key,def:CONFIG.mods[key]},x,y);
  };
  put('kinetic',3,3);
  put('blades',2,3);
  put('burn',2,2); // Горение только на клинках
  put('laser',3,4);
  put('lightning',4,3); // Молния только на рывке
  const mods=b.modifiersFor(b.secondaryId('kinetic'));
  return {b,mods};
}

test('Rarity pool contains precisely two X2 and one X3',()=>{
  assert.equal(CONFIG.rewards.pool.x2,2);
  assert.equal(CONFIG.rewards.pool.x3,1);
});

test('The same modifier tree keeps unrelated mechanics and elements separate',()=>{
  const {mods}=composition();
  assert.ok(mods.scopes.root.laser);
  assert.ok(mods.scopes.root.lightning);
  assert.ok(mods.scopes.root.blades);
  assert.equal(forCarrier(mods,'root').burn,null);
  assert.ok(forCarrier(mods,'blades').burn);
  assert.equal(forCarrier(mods,'blades').lightning,null);
  assert.ok(mods.scopes.blades.burn.damage>0);
});

test('Root and blade damage respect the nearest mechanical parent',()=>{
  const {mods}=composition(), g=Object.create(Game.prototype);
  g.config=CONFIG;g.kineticMods=mods;
  assert.equal(g.kineticEl().bd,0);
  assert.equal(g.kineticEl().cm,1);
  assert.ok(g.kineticEl('blades').bd>0);
  assert.equal(g.kineticEl('blades').cm,1);
});

test('Laser announces every lightning hop BEFORE moving the hero',()=>{
  const enemies=[100,200,300].map((x,i)=>({active:true,x,y:0,radius:10,gen:i+1}));
  const h={active:true,x:0,y:0,invuln:0,radius:14};
  const beams=[],hits=[];
  const arena={left:-1000,right:1000,top:-1000,bottom:1000,circleHitsRock:()=>false};
  const d=new LightDash({
    config:CONFIG,hero:h,enemies:{items:enemies},arena,rnd:()=>0.5,
    combat:{damageEnemy(e,n){hits.push(e);return true;}},
    onTelegraph:(x0,y0,x1,y1)=>beams.push([x0,y0,x1,y1]),
  });
  d.laserMode=true;d.bounces=3;
  assert.equal(d.plan(),true);
  d.begin();
  assert.equal(beams.length,1);
  d.update(CONFIG.kinetic.beamTime/2);
  assert.equal(h.x,0);
  d.update(CONFIG.kinetic.beamTime/2+0.001);
  assert.ok(h.x>0);
  for(let i=0;i<80;i++)d.update(0.016);
  assert.equal(beams.length,3);
  assert.equal(hits.length,3);
  assert.equal(d.active,false);
});

test('Blades from the dash retain homing and burn independently of dash',()=>{
  const {mods}=composition(), g=Object.create(Game.prototype);
  const target={active:true,x:65,y:0,radius:15,hp:1000};
  g.config=CONFIG;g.hero={active:true,x:0,y:0,dashing:true,glideTime:0};
  g.enemies={items:[target]};
  g.arena={circleHitsRock:()=>false};
  g.defense={kinetic:true,dashSeq:1,dashX:1,dashY:0,kineticBladeDistanceMul:1};
  g.kineticMods=mods;
  g.lightdash={active:false,route:[]};
  g.kineticBlades=[];g.kineticBladeTrail=null;
  const hits=[];
  g.combat={damageEnemy(e,n){hits.push(n);return true;}};
  let burns=0;g.ignite=()=>burns++;
  g.beginKineticBladeTrail();
  for(let i=1;i<=10;i++) {
    g.hero.x=i*20;
    g.spawnKineticBlades();
    g.updateKineticBlades(0.016);
  }
  g.hero.dashing=false;
  g.spawnKineticBlades();
  for(let i=0;i<90;i++)g.updateKineticBlades(0.016);
  assert.ok(hits.length>0);
  assert.ok(burns>0);
});

test('Laser-only dash computes a safe endpoint and lands after the beam',()=>{
  const g=Object.create(Game.prototype);
  g.config=CONFIG;
  g.hero={x:0,y:0,radius:14,invuln:0,glideTime:0,active:true,
    place(x,y){this.x=x;this.y=y;}};
  g.arena={left:-200,right:200,top:-200,bottom:200,zone:null,
    circleHitsRock:()=>false,resolveCircle:()=>{}};
  g.laserDash={active:false};
  g.kineticBladeTrail=null;g.spawnKineticBlades=()=>{};
  let landed=0;g.bus={emit(type){if(type==='dash:landed')landed++}};
  g.startLaserDash({dirX:1,dirY:0,distance:192,seq:5});
  assert.equal(g.hero.x,0);
  assert.ok(g.laserDash.x<=186);
  g.finishLaserDash({seq:5});
  assert.ok(g.hero.x>0);
  assert.equal(landed,1);
});
