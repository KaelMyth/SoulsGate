// Проверка Фантома на Поглощении (#150).
// Запуск: node --experimental-default-type=module --test tests/phantom-absorption-chain.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { phantomRoll } from '../systems_phantom.js';
import { Absorption } from '../systems_absorption.js';
import { Game } from '../game.js';

function shieldBuild(boost) {
  const b = new BuildGrid(7);
  b.placeCore('shield', CONFIG.cores.shield, 3, 3);
  for (const [key,x,y] of [
    ['absorption',3,4], ['phantom',3,5], ...(boost ? [[boost,3,6]] : []),
  ]) {
    const result = canPlace(b, CONFIG.mods[key], x, y);
    assert.equal(result.ok, true, key + ': ' + result.reason);
    b.placeMod({key, def:CONFIG.mods[key]},x,y);
  }
  return b;
}

test('X2/X3 on Phantom increase chance of Absorption clones',()=>{
  const base = shieldBuild().modifiersFor('shield');
  const twice = shieldBuild('x2').modifiersFor('shield');
  const thrice = shieldBuild('x3').modifiersFor('shield');
  assert.equal(base.absorption.phantomChanceMult, 1);
  assert.equal(twice.absorption.phantomChanceMult, 2);
  assert.equal(thrice.absorption.phantomChanceMult, 3);
  assert.equal(base.absorption.phantom, true);
  assert.ok(phantomRoll(CONFIG.phantom,()=>0.19,0.2,0));
  assert.equal(phantomRoll(CONFIG.phantom,()=>0.2,0.2,0),false);
  assert.ok(phantomRoll(CONFIG.phantom,()=>0.099,0.2,1));
  assert.equal(phantomRoll(CONFIG.phantom,()=>0.1,0.2,1),false);
  assert.ok(phantomRoll(CONFIG.phantom,()=>0.049,0.2,2));
  assert.equal(phantomRoll(CONFIG.phantom,()=>0.05,0.2,2),false);
  assert.equal(phantomRoll(CONFIG.phantom,()=>0,0.2,10),false);
});

test('A Phantom on a separate Blades branch cannot amplify Absorption copies',()=>{
  const b = shieldBuild();
  for(const [key,x,y] of [['blades',2,3],['phantom',1,3],['x2',0,3]]){
    const result = canPlace(b,CONFIG.mods[key],x,y);
    assert.equal(result.ok,true,key+': '+result.reason);
    b.placeMod({key,def:CONFIG.mods[key]},x,y);
  }
  const m=b.modifiersFor('shield');
  assert.equal(m.absorption.phantomChanceMult,1);
  assert.equal(m.phantom.mult,3);
});

test('Probability below 5% stops the chain without even rolling RNG',()=>{
  const F=CONFIG.phantom;
  let rolls=0;
  const rnd=()=>{rolls++;return 0;};
  assert.equal(phantomRoll(F,rnd,0.2,2),true);  // 5% is allowed
  assert.equal(rolls,1);
  assert.equal(phantomRoll(F,rnd,0.2,3),false); // 2.5% is stopped
  assert.equal(rolls,1);
  assert.equal(phantomRoll(F,rnd,0.4,3),true);  // X2: 5% is allowed
  assert.equal(phantomRoll(F,rnd,0.4,4),false); // X2: 2.5% is stopped
  assert.equal(phantomRoll(F,rnd,0.6,3),true);  // X3: 7.5% is allowed
  assert.equal(phantomRoll(F,rnd,0.6,4),false); // X3: 3.75% is stopped
  assert.equal(rolls,3);
  assert.equal(phantomRoll(F,rnd,100,9),true); // fallback cap still works
  assert.equal(phantomRoll(F,rnd,100,10),false);
  assert.equal(rolls,4);
});

test('Phantom Absorption chain stops at 5% for normal, X2 and X3',()=>{
  for (const [boost,expectedHits] of [[null,4],['x2',5],['x3',5]]) {
    const m = shieldBuild(boost).modifiersFor('shield');
    const enemies = [0,1].map(i=>({
      active:true, gen:i+1, x:i*60, y:0, radius:12, hp:10000,
    }));
    const hero={active:true,hp:100,maxHp:100}, hits=[];
    const game=Object.create(Game.prototype);
    game.config=CONFIG;
    game.hero=hero;
    game.enemies={items:enemies};
    game.rnd=()=>0; // all rolls at or above the threshold succeed
    game.synergyCasts=[];
    game.synergyFlashes=[];
    game.absorption=new Absorption({
      config:CONFIG,hero,enemies:game.enemies,
      combat:{damageEnemy(e,amount){hits.push({e,amount});return true;}},
    });
    game.absorption.onPhantom=(e,mods,gen)=>game.tryPhantomAbsorption(e,mods,gen);
    game.absorption.strike(enemies[0],m);
    for(let i=0;i<12;i++)game.updateSynergyCasts(0.5);
    assert.equal(hits.length,expectedHits,String(boost));
    assert.equal(hits[0].amount,CONFIG.absorption.damage);
    for(const copy of hits.slice(1))assert.equal(copy.amount,CONFIG.absorption.damage*0.5);
    assert.equal(game.synergyCasts.length,0);
  }
});

test('A phantom cannot chain if there is no nearby living enemy',()=>{
  const game=Object.create(Game.prototype);
  game.config=CONFIG; game.hero={active:true}; game.rnd=()=>0;
  game.synergyCasts=[];
  const primary={active:true,gen:1,x:0,y:0};
  game.enemies={items:[primary,{active:true,gen:2,x:500,y:0}]};
  const m=shieldBuild().modifiersFor('shield');
  assert.equal(game.tryPhantomAbsorption(primary,m,0),false);
  assert.equal(game.synergyCasts.length,0);
});
