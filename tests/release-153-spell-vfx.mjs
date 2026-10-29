// SoulsGate #153 — игровые Canvas-модельки вместо иллюстраций.
 // Запуск: node --experimental-default-type=module --test tests/release-153-spell-vfx.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {SpellFx} from '../render_spellfx.js';
import {CONFIG} from '../config_game.js';
import {Absorption} from '../systems_absorption.js';

function makeCtx() {
  const calls=[];
  const gr={addColorStop(){}};
  const ctx={calls,globalAlpha:1,globalCompositeOperation:'source-over',
    save(){calls.push('save')},restore(){calls.push('restore')},
    createRadialGradient(){calls.push('radial');return gr},
    createLinearGradient(){calls.push('linear');return gr},
    fillRect(){},beginPath(){},closePath(){},moveTo(){},lineTo(){},
    quadraticCurveTo(){},ellipse(){},arc(){},stroke(){calls.push('stroke')},
    fill(){calls.push('fill')},translate(){},rotate(){},drawImage(){calls.push('sprite')},
  };
  return ctx;
}

test('Absorption and Phantom charge render curved smoke and glowing rings',()=>{
  const fx=new SpellFx(),c=makeCtx();
  fx.absorptionCharge(c,40,25,18,.45,2,'blood',1);
  const count=c.calls.length;
  fx.absorptionCharge(c,40,25,18,.45,2,'phantom',1);
  assert.ok(count>8);
  assert.ok(c.calls.length>count);
  assert.ok(c.calls.includes('radial')&&c.calls.includes('stroke'));
});

test('Base absorption flash and Pierce+Absorption crimson burst are separate variants',()=>{
  const fx=new SpellFx(),c=makeCtx();
  fx.absorptionBurst(c,40,25,18,.8,1,'blood');
  const count=c.calls.length;
  fx.absorptionBurst(c,40,25,54,.8,1,'scarlet');
  assert.ok(c.calls.length>count);
  fx.absorptionBurst(c,40,25,18,.8,1,'phantom');
  assert.ok(c.calls.length>count*2);
});

test('Laser+Absorption and Gravity projectile render their own live VFX',()=>{
  const fx=new SpellFx(),c=makeCtx();
  fx.absorptionLaser(c,10,20,100,60,3,.8,2.5);
  assert.ok(c.calls.includes('stroke'));
  const len=c.calls.length;
  fx.gravityLens(c,40,25,9,.85,2.5,60,0);
  assert.ok(c.calls.length>len);
});

test('Spectral rain sword is a cached real in-game sprite, not a placeholder outline',()=>{
  const old=globalThis.OffscreenCanvas;
  let count=0;
  class FakeCanvas {
    constructor(){count++;}
    getContext(){return makeCtx();}
  }
  globalThis.OffscreenCanvas=FakeCanvas;
  try{
    const fx=new SpellFx(),c=makeCtx();
    fx.rainSword(c,10,20,.6,1);
    fx.rainSword(c,20,50,.8,1.5);
    assert.equal(count,1);
    assert.equal(c.calls.filter(v=>v==='sprite').length,2);
  }finally {
    if(old===undefined)delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas=old;
  }
});

test('Pierce strike records a scarlet burst and normal Absorption keeps a dark burst',()=>{
  const one={active:true,x:0,y:0,radius:12,hp:1000},two={active:true,x:20,y:0,radius:12,hp:1000};
  const a=new Absorption({config:CONFIG,hero:{active:true,x:0,y:0,hp:100,maxHp:100},
    enemies:{items:[one,two]},combat:{damageEnemy(){return true;}}});
  a.strike(one,{absorption:{pierce:true,damage:1}});
  assert.equal(a.flashes.length,2);
  assert.ok(a.flashes.some(f=>f.pierce===true));
  a.strike(one,{absorption:{damage:1}},.5,false,1);
  assert.ok(a.flashes.at(-1).phantom);
});
