import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Incarnation } from '../systems_incarnation.js';
import { parentAccepts } from '../build_rules.js';
function setup(mods) {
 const hero={active:true,x:0,y:0,prevX:0,prevY:0,radius:14,facing:0,incarnationT:5,incarnationSpeedMul:1};
 const enemies={items:[{active:true,hp:2000,x:120,y:0,radius:12,gen:1}]};
 const inc=new Incarnation({config:CONFIG,hero,enemies,combat:{damageEnemy(e,v){e.hp-=v;return true}}});
 inc.begin(mods);
 return {inc,hero,enemies};
}
test('Power, haste and root X2/X3 compatible with Incarnation',()=>{
 assert.equal(parentAccepts(CONFIG.mods.power,{def:CONFIG.mods.incarnation},null),true);
 assert.equal(parentAccepts(CONFIG.mods.haste,{def:CONFIG.mods.incarnation},null),true);
 assert.equal(parentAccepts(CONFIG.mods.x2,{def:CONFIG.mods.incarnation},null),true);
});
test('All requested multipliers scale incarnation sphere count',()=>{
 for(const count of [2,3,4,6,8,9,12,24]) {
  const {inc}=setup({incarnationCount:{percent:(count-1)*100}});
  assert.equal(inc.splitCount,count);
  assert.ok(inc.damageMultiplier>1);
 }
});
test('Haste speeds the blade volley and power increases its damage',()=>{
 const base=setup({blades:{max:1}});
 const boost=setup({blades:{max:1},rate:{percent:100},damage:{percent:20},incarnationCount:{percent:100}});
 assert.ok(Math.abs(boost.inc.bladeGap-base.inc.bladeGap/2)<1e-9); // Скорость +100% вдвое сокращает паузу между клинками
 assert.equal(boost.inc.splitCount,2);
 assert.ok(boost.inc.damageMultiplier>base.inc.damageMultiplier);
});
test('Laser inherits split strands',()=>{
 const {inc}=setup({laser:{damage:1},incarnationCount:{percent:200}});
 inc.update(.12);
 assert.equal(inc.splitCount,3);
 assert.ok(inc.laserPath.some(p=>p.strands===3));
});
