import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { parentAccepts } from '../build_rules.js';
import { Incarnation } from '../systems_incarnation.js';
import { Xp } from '../systems_xp.js';

test('Laser has three damage ticks per second',()=>{
 assert.ok(Math.abs(CONFIG.laser.interval - 1/3)<1e-8);
});
test('Phantom attaches directly to Laser',()=>{
 assert.equal(parentAccepts(CONFIG.mods.phantom,null,'laser'),true);
});
test('Incarnation laser ends after half a second without enemies',()=>{
 const hero={active:true,x:0,y:0,radius:12,incarnationT:3,incarnationLaser:false,incarnationSpeedMul:1};
 const inc=new Incarnation({config:CONFIG,hero,enemies:{items:[]},combat:{damageEnemy(){return true}}});
 inc.begin({laser:{damage:1}});
 inc.update(.49);
 assert.equal(hero.incarnationLaser,true);
 inc.update(.01);
 assert.equal(hero.incarnationLaser,false);
 assert.equal(hero.incarnationT,0);
});
test('Healing potion restores twenty health up to cap',()=>{
 const events=[];
 const bus={on(){},emit(...args){events.push(args)}};
 const hero={hp:91,maxHp:100};
 const xp=new Xp({config:CONFIG,hero,gems:{},bus,rnd:()=>0});
 xp.collect({active:true,def:CONFIG.gems.heal,x:0,y:0});
 assert.equal(hero.hp,100);
 assert.ok(events.some(e=>e[0]==='hero:healed'));
});
test('Drop chance is one in fifty',()=>{
 assert.equal(CONFIG.gems.healDropChance,1/50);
});
