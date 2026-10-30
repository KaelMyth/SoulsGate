// SoulsGate #156: клубящийся дым постепенно обволакивает врага, без чётких контуров.
// node --experimental-default-type=module --test tests/release-155-absorption-sphere.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {SpellFx} from '../render_spellfx.js';
import {Renderer} from '../render_renderer.js';

const canvasMock=()=>{
  const history=[],stops=[];
  const gradient=()=>({addColorStop(offset,color){stops.push({offset,color});}});
  const c={
    history,stops,globalAlpha:1,globalCompositeOperation:'source-over',
    save(){history.push('save')},restore(){history.push('restore')},
    createRadialGradient(){history.push('radial');return gradient();},
    createLinearGradient(){history.push('linear');return gradient();},
    beginPath(){},closePath(){},moveTo(){},lineTo(){},bezierCurveTo(){},
    arc(x,y,r){history.push(['arc',x,y,r]);},ellipse(){},
    fill(){history.push('fill')},stroke(){history.push('stroke')},
  };
  return c;
};
test('Two layers assemble around the target as the cast approaches completion',()=>{
  const v=new SpellFx(),c=canvasMock();
  v.absorptionSphereBack(c,55,70,20,.15,1.4,'blood',2);
  v.absorptionSphereFront(c,55,70,20,.15,1.4,'blood',2);
  const initial=c.stops.length;
  const firstCenter=c.stops.filter(s=>s.offset===0).map(s=>s.color);
  c.stops.length=0;
  v.absorptionSphereBack(c,55,70,20,.95,1.4,'blood',2);
  v.absorptionSphereFront(c,55,70,20,.95,1.4,'blood',2);
  assert.ok(initial>10 && c.stops.length>10);
  const initialPeak=Math.max(...firstCenter.map(s=>parseFloat(s.match(/,([0-9.]+)\)$/)?.[1]||0)));
  const finalPeak=Math.max(...c.stops.filter(s=>s.offset===0).map(s=>parseFloat(s.color.match(/,([0-9.]+)\)$/)?.[1]||0)));
  assert.ok(finalPeak>initialPeak,'later sphere has stronger front coverage');
  assert.ok(c.history.some(x=>Array.isArray(x)&&x[0]==='arc'&&x[1]===55&&x[2]===70));
});
test('Phantom is a distinct violet sphere and both spheres collapse on impact',()=>{
  const v=new SpellFx(),normal=canvasMock(),phantom=canvasMock();
  v.absorptionSphereFront(normal,55,70,20,.85,1,'blood',0);
  v.absorptionSphereFront(phantom,55,70,20,.85,1,'phantom',0);
  assert.notDeepEqual(normal.stops,phantom.stops);
  const c=canvasMock();
  v.absorptionSphereBurst(c,55,70,20,.7,1,'blood');
  assert.ok(c.history.includes('fill'));
});
test('Game renderer places sphere back behind enemy and sphere front above it',()=>{
  const src=Renderer.prototype.drawAbsorptionMarker.toString();
  const top=Renderer.prototype.drawAbsorptionVeils.toString();
  assert.ok(src.includes('absorptionSphereBack'));
  assert.ok(top.includes('absorptionSphereFront'));
  assert.ok(!top.includes('absorptionVeil('));
});

test('Smoke envelops enemy progressively and textures are cached, not rebuilt per frame',()=>{
  const previous=globalThis.OffscreenCanvas;
  let created=0;
  class FakeCanvas {
    constructor(){created++;}
    getContext(){return canvasMock();}
  }
  globalThis.OffscreenCanvas=FakeCanvas;
  try{
    const fx=new SpellFx(),c=canvasMock();
    c.drawImage=function(){this.history.push('smoke');};
    fx.absorptionSphereFront(c,20,30,16,.09,1,'blood',0);
    const early=c.history.filter(x=>x==='smoke').length;
    c.history.length=0;
    fx.absorptionSphereFront(c,20,30,16,.96,1,'blood',0);
    const late=c.history.filter(x=>x==='smoke').length;
    assert.ok(late>early*2,'smoke clouds gather and cover the enemy');
    assert.equal(created,2,'only two pre-rendered smoke textures');
    fx.absorptionSphereFront(c,20,30,16,1,1.2,'blood',1);
    assert.equal(created,2,'no canvas allocation on later frames');
    assert.ok(!c.history.includes('stroke'),'absorption smoke has no sharp circular outlines');
  }finally{
    if(previous===undefined)delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas=previous;
  }
});
