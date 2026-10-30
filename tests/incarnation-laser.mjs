import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Incarnation } from '../systems_incarnation.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';

function setup() {
 const hero={active:true,x:0,y:0,prevX:0,prevY:0,radius:12,facing:0,incarnationT:3,incarnationSpeedMul:1.7,incarnationInertia:.34};
 const enemies={items:[{active:true,hp:1000,x:1000,y:0,radius:10,gen:1},{active:true,hp:1000,x:2200,y:0,radius:10,gen:2}]};
 const hits=[];
 const inc=new Incarnation({config:CONFIG,hero,enemies,combat:{damageEnemy(e,n){hits.push(e);e.hp-=n;return true}},arena:{resolveCircle(p){p.x=Math.max(-3000,Math.min(3000,p.x));p.y=Math.max(-3000,Math.min(3000,p.y))}}});
 inc.begin({laser:{damage:1}});
 return {hero,enemies,hits,inc};
}
test('Laser attaches to incarnation core',()=>{
 const g=new BuildGrid(7);
 g.placeMod({key:'incarnation',def:CONFIG.mods.incarnation},3,3);
 assert.equal(canPlace(g,CONFIG.mods.laser,3,4).ok,true);
});
test('Laser can jump to enemies regardless of camera or attack radius',()=>{
 const {hero,inc,hits}=setup();
 inc.update(.12);
 assert.equal(hero.x,1000);
 inc.update(.12);
 assert.equal(hero.x,2200);
 assert.equal(hits.length,2);
 assert.equal(hero.incarnationLaser,true);
});
test('Laser transformation ends after 3 seconds at position away from enemies',()=>{
 const {hero,inc,enemies}=setup();
 for(let i=0;i<30;i++) inc.update(.1);
 assert.equal(hero.incarnationLaser,false);
 assert.equal(hero.incarnationT,0);
 assert.equal(inc.laserTime,0);
 assert.ok(enemies.every(e=>Math.hypot(hero.x-e.x,hero.y-e.y)>hero.radius+e.radius));
});
