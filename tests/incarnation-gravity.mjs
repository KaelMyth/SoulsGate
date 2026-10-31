import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Incarnation } from '../systems_incarnation.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
test('Gravity attaches directly to Incarnation',()=>{
 const g=new BuildGrid(7);
 g.placeMod({key:'incarnation',def:CONFIG.mods.incarnation},3,3);
 assert.equal(canPlace(g, CONFIG.mods.gravity,3,4).ok,true);
});
test('Gravity form runs for five real seconds and leaves afterimages while moving',()=>{
 const hero={active:true,x:0,y:0,vx:120,vy:0,facing:0,incarnationT:5,incarnationSpeedMul:3};
 const inc=new Incarnation({config:CONFIG,hero,enemies:{items:[]},combat:{damageEnemy(){return true}}});
 inc.begin({gravity:{count:1}});
 assert.equal(inc.gravityTime,5);
 inc.update(.1);
 assert.ok(inc.afterimages.length>0);
 assert.ok(inc.gravityTime<5);
 for(let i=0;i<51;i++)inc.update(.1);
 assert.ok(inc.gravityTime<1e-9);
 assert.equal(hero.incarnationT,0);
 assert.equal(inc.active,false);
});
test('Gravity settings slow world and speed casting',()=>{
 const S=CONFIG.skills.incarnation;
 assert.ok(S.gravityWorldScale>0&&S.gravityWorldScale<1);
 assert.ok(S.gravityCastMultiplier>1);
 assert.ok(S.gravitySpeedMultiplier>1);
});
