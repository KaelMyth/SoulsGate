// Релиз №165. Северная крепость является настоящей частью карты,
// а не картинкой поверх экрана. Проверяем архитектуру, спавн и коллизии.
// node --experimental-default-type=module --test tests/north-gate.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Arena } from '../world_arena.js';
import { NavGrid } from '../world_nav.js';
import { pickSpawnPoint } from '../systems_spawner.js';
import { NorthGateArt } from '../render_northgate.js';

test('Северная стена видна как непроходимая полоса с воротами посередине',()=>{
  const arena=new Arena(CONFIG.arena);
  assert.equal(arena.northWall.depth,206);
  assert.equal(arena.walkTop,arena.top+206);
  assert.equal(CONFIG.arena.northWall.gateWidth,218);
  const player={x:0,y:arena.top+18,radius:12};
  arena.resolveCircle(player);
  assert.ok(player.y>=arena.walkTop+player.radius,'герой не попадает за ворота');
  assert.equal(arena.circleHitsRock(0,arena.top+80,8),true,'снаряд не проходит сквозь стену');
  assert.equal(arena.circleHitsRock(0,arena.top+350,8),false);
  assert.equal(arena.segmentBlocked(0,arena.top+250,0,arena.top+40,3),true);
  assert.equal(arena.segmentBlocked(0,arena.top+350,40,arena.top+320,3),false);
});

test('Враги не появляются внутри стены, навигация отмечает стену непроходимой',()=>{
  const arena=new Arena(CONFIG.arena);
  const nav=new NavGrid(arena,CONFIG.nav);
  assert.equal(nav.blocked[nav.cellY(arena.top+15)*nav.cols+nav.cellX(0)],1);
  assert.equal(nav.blocked[nav.cellY(arena.top+390)*nav.cols+nav.cellX(0)],0);
  const cam={x:0,y:0,viewW:500,viewH:500};
  let seed=71;
  const rnd=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  let success=0;
  for(let i=0;i<64;i++){
    const at={x:0,y:0};
    if(!pickSpawnPoint(rnd,cam,arena,30,at))continue;
    assert.ok(at.y>arena.walkTop+20,'точка вне стены');
    assert.ok(at.x>arena.left&&at.x<arena.right);
    success++;
  }
  assert.ok(success>0);
});

test('Игровая графика отрисовывает каменную стену, ворота и живые факелы, кэшируя статичный слой',()=>{
  const arena=new Arena(CONFIG.arena);
  const calls={fills:0,strokes:0,gradients:0,sprites:0};
  const canvasContext=new Proxy({
    createLinearGradient(){calls.gradients++;return{addColorStop(){}};},
    createRadialGradient(){calls.gradients++;return{addColorStop(){}};},
    fill(){calls.fills++;},stroke(){calls.strokes++;},drawImage(){calls.sprites++;},
  },{get(t,k){return k in t?t[k]:()=>{};}});
  const previous=globalThis.document;
  globalThis.document={createElement(){return{width:0,height:0,getContext(){return canvasContext;}};}};
  try {
    const north=new NorthGateArt(arena);
    const display=new Proxy({drawImage(){calls.sprites++;},
      createRadialGradient(){calls.gradients++;return{addColorStop(){}};},
      fill(){calls.fills++;},stroke(){calls.strokes++;},
    },{get(t,k){return k in t?t[k]:()=>{};}});
    north.draw(display,arena.left,arena.right,arena.top,arena.top+440,1);
    const cached=north.cached;
    assert.ok(cached);
    assert.equal(cached.width,arena.width);
    assert.ok(calls.fills>100,'каменная кладка и отдельные детали ворот');
    assert.ok(calls.strokes>100,'камни, руны, статуи и обводки');
    assert.ok(calls.gradients>=3,'объём стен и мягкий свет факелов');
    north.draw(display,arena.left,arena.right,arena.top,arena.top+440,2);
    assert.equal(north.cached,cached,'фон не перестраивается на каждом кадре');
    assert.ok(calls.sprites>=2,'две отрисовки кэша');
  } finally {
    if(previous===undefined)delete globalThis.document;
    else globalThis.document=previous;
  }
});

test('Финальный остров отключает прежнюю коллизию северной крепости',()=>{
  const arena=new Arena(CONFIG.arena);
  arena.setZone({left:-120,right:120,top:-220,bottom:220});
  const player={x:0,y:-200,radius:10};
  arena.resolveCircle(player);
  assert.ok(player.y>=-210&&player.y<0);
  assert.equal(arena.circleHitsRock(0,arena.top+55,5),false);
});
