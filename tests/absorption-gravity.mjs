import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { parentAccepts } from '../build_rules.js';
import { Absorption } from '../systems_absorption.js';
test('Гравитация крепится прямо на Поглощение',()=>{
 assert.equal(parentAccepts(CONFIG.mods.gravity,null,'absorption'),true);
});
test('Гравитация держит цель только во время подготовки и снимается после удара',()=>{
 const e={active:true,x:100,y:0,radius:10,hp:300,gen:1};
 const hero={active:true,x:0,y:0,maxHp:100,hp:100};
 const A=CONFIG.absorption;
 const mods={absorption:{standaloneCount:1,standaloneTargets:1,rate:1,damage:1,gravity:true}};
 const inc=new Absorption({config:CONFIG,hero,enemies:{items:[e]},camera:{x:0,y:0,viewW:1000,viewH:1000},combat:{damageEnemy(target,d){target.hp-=d;return true}},modifiers:()=>mods});
 inc.update(A.interval-A.telegraph+.01);
 assert.equal(inc.aiming,true);
 assert.equal(e.absorptionGravity,true);
 inc.update(A.telegraph+.01);
 assert.equal(e.absorptionGravity,false);
 assert.equal(inc.aiming,false);
});
