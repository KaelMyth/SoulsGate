import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Incarnation } from '../systems_incarnation.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';

test('Клинки можно крепить к Воплощению', () => {
  const g = new BuildGrid(7);
  g.placeMod({key:'incarnation',def:CONFIG.mods.incarnation},3,3);
  assert.equal(canPlace(g,CONFIG.mods.blades,3,4).ok,true);
});
function make(factor=1) {
  const hero={active:true,x:0,y:0,prevX:0,prevY:0,radius:12,facing:0,incarnationT:30,incarnationSpeedMul:1.7,incarnationInertia:0.34};
  const enemies={items:[{active:true,hp:500,x:80,y:0,radius:12,gen:1}]};
  const hits=[];
  const c=new Incarnation({config:CONFIG,hero,enemies,combat:{damageEnemy(e,d){e.hp-=d;hits.push(d);return true}}});
  c.begin({blades:{max:factor,damage:1}});
  return {c,hero,hits,enemies};
}
test('Количество: базовые 4, Х2 даёт 6, Х3 даёт 8, Х4 даёт 10',()=>{
  for (const [factor,count] of [[1,4],[2,6],[3,8],[4,10]]) {
    const {c}=make(factor);
    assert.equal(c.bladeQueue,count);
    assert.equal(c.bladeItems.length,count);
  }
});
test('Каждые полсекунды вылетает только один клинок; после последнего заканчивается превращение',()=>{
  const {c,hero}=make();
  c.update(0.4901);
  assert.equal(c.bladeQueue,4);
  c.update(0.0101);
  assert.equal(c.bladeQueue,3);
  c.update(0.5);
  assert.equal(c.bladeQueue,2);
  c.update(0.5);
  assert.equal(c.bladeQueue,1);
  c.update(0.5);
  assert.equal(c.bladeQueue,0);
  assert.equal(hero.incarnationT,0);
});
test('Клинки наследуют облик стихий',()=>{
  for (const [mods,kind,zap] of [[{burn:{}},2,0],[{frost:{}},1,0],[{burn:{},frost:{}},3,0],[{lightning:{}},0,1]]) {
    const {c}=make();
    c.begin({blades:{max:1},...mods});
    assert.equal(c.bladeItems[0].kind,kind);
    assert.equal(c.bladeItems[0].zap,zap);
  }
});

test('Залп не дольше 5 секунд',()=>{
 for(const [factor,count,gap] of [[1,4,.5],[4,10,.5],[9,20,.25]]) {
  const {c}=make(factor);
  assert.equal(c.bladeQueue,count);
  assert.ok(Math.abs(c.bladeGap-gap)<1e-8);
 }
});
test('Клинки смотрят по движению',()=>{
 const {c,hero}=make();
 hero.vx=0;hero.vy=100;
 c.update(.1);
 for(const b of c.bladeItems) if(b.state==='orbit') assert.ok(Math.abs(b.a-Math.PI/2)<=0.23); // допускается покачивание облака ±0.22
});
