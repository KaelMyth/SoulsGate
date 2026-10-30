// Релиз 163: третье умение «Воодушевление».
// node --experimental-default-type=module --test tests/inspiration.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Xp,createGem,resetGem } from '../systems_xp.js';
import { Inspiration } from '../systems_inspiration.js';
import { InspirationFx } from '../render_inspiration.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { Rewards } from '../systems_rewards.js';

function setup(){
  const hero={active:true,x:0,y:0,radius:12,hp:5,maxHp:20};
  const emitted=[];
  const callbacks=new Map();
  const bus={on(name,cb){callbacks.set(name,cb);},emit(name,data){emitted.push({name,data});}};
  const gems={count:0,items:[],spawn(){
    const g=createGem();g.active=true;this.items.push(g);this.count++;
    return g;
  }};
  const xp=new Xp({config:CONFIG,hero,gems,bus,rnd:()=>0.25});
  const inspiration=new Inspiration({config:CONFIG,hero,gems,bus});
  xp.inspiration=inspiration;
  const gem=(kind,x,y)=>{
    const g=gems.spawn();g.kind=kind;g.def=CONFIG.gems[kind];
    g.radius=g.def.radius;g.x=g.prevX=x;g.y=g.prevY=y;
    g.age=1;return g;
  };
  return {hero,emitted,gems,xp,inspiration,gem};
}
function advance(s,seconds){
  const steps=Math.ceil(seconds*60);
  for(let i=0;i<steps;i++){
    s.xp.update(1/60);
    s.inspiration.update(1/60);
  }
}

test('Третье умение присутствует как отдельное мод-ядро и доступно в наградах',()=>{
  const grid=new BuildGrid(7);
  const def=CONFIG.mods.inspiration;
  assert.equal(def.effect.secondary,true);
  assert.equal(grid.placeMod({key:'inspiration',def},3,3),true);
  assert.ok(grid.secondaryId('inspiration'));
  assert.equal(CONFIG.rewards.pool.inspiration,1);
  const rewards=new Rewards({config:CONFIG});
  assert.ok(rewards.bag.includes('inspiration'));
});

test('Зелёные и красные камни с любой дальности долетают и лечат каждый ровно на 1 HP',()=>{
  const s=setup();
  const green=s.gem('green',3000,1500);
  const red=s.gem('red',-4500,2600);
  assert.equal(s.inspiration.begin(),true);
  advance(s,CONFIG.skills.inspiration.travelTime*.5);
  assert.equal(green.active,true);
  assert.equal(red.active,true);
  assert.ok(green.inspireT>.45 && green.inspireT<.55);
  advance(s,CONFIG.skills.inspiration.travelTime*.55);
  assert.equal(green.active,false);
  assert.equal(red.active,false);
  assert.equal(s.hero.hp,7);
  assert.equal(s.inspiration.collected,2);
  assert.equal(s.inspiration.healed,2);
  assert.ok(s.xp.total>0);
  assert.equal(s.emitted.filter(v=>v.name==='hero:healed').length,2);
});

test('Красный кристалл опыта даёт не 5 HP, а 1; обычный сбор не лечит',()=>{
  const s=setup(),stone=s.gem('red',0,0);
  s.xp.update(.02);
  assert.equal(stone.active,false);
  assert.equal(s.hero.hp,5);
  const red=s.gem('red',2000,0);
  s.inspiration.begin();
  advance(s,CONFIG.skills.inspiration.travelTime+.05);
  assert.equal(red.active,false);
  assert.equal(s.hero.hp,6);
});

test('Камни исцеления сохраняют собственный эффект и не получают бонус Воодушевления',()=>{
  const s=setup();
  const h=s.gem('heal',1000,0);
  s.inspiration.begin();
  advance(s,CONFIG.skills.inspiration.travelTime+.06);
  assert.equal(h.active,true);
  assert.equal(h.inspired,false);
  h.x=h.y=0;
  s.xp.update(1/60);
  assert.equal(h.active,false);
  assert.equal(s.hero.hp,20);
  assert.equal(s.inspiration.collected,0);
});

test('Лечение ограничено максимумом HP, опыт не теряется',()=>{
  const s=setup();s.hero.hp=19;
  for(let i=0;i<5;i++)s.gem(i===3?'red':'green',1500+i*80,700);
  s.inspiration.begin();
  advance(s,CONFIG.skills.inspiration.travelTime+.06);
  assert.equal(s.hero.hp,20);
  assert.equal(s.inspiration.collected,5);
  assert.equal(s.inspiration.healed,1);
  assert.ok(s.xp.total>=5);
});

test('Срок сияния закончился, но уже притянутый дальний камень долетает и лечит',()=>{
  const s=setup();s.inspiration.begin();
  advance(s,CONFIG.skills.inspiration.duration-.1);
  const late=s.gem('green',9900,1300);
  advance(s,.2);
  assert.equal(s.inspiration.remaining,0);
  assert.equal(late.inspired,true);
  assert.equal(s.inspiration.active,true);
  advance(s,CONFIG.skills.inspiration.travelTime+.01);
  assert.equal(late.active,false);
  assert.equal(s.hero.hp,6);
  assert.equal(s.inspiration.active,false);
});

test('Повторное использование камня не переносит прошлый статус притяжения',()=>{
  const s=setup();const stone=s.gem('green',1000,0);
  s.inspiration.begin();s.xp.update(.01);
  assert.equal(stone.inspired,true);
  resetGem(stone);
  assert.equal(stone.inspired,false);
  assert.equal(stone.inspireT,0);
  const fresh=createGem();
  assert.equal(fresh.inspired,false);
});

test('Графика золотой сферы рисует несколько мягких слоёв и след от кристалла',()=>{
  const s=setup();s.inspiration.begin();s.inspiration.update(.3);
  const calls={gradients:0,strokes:0,fills:0,glows:0};
  const ctx=new Proxy({
    save(){},restore(){},translate(){},beginPath(){},closePath(){},moveTo(){},
    lineTo(){},quadraticCurveTo(){},bezierCurveTo(){},
    stroke(){calls.strokes++},fill(){calls.fills++},arc(){},ellipse(){},
    drawImage(){calls.glows++},createRadialGradient(){calls.gradients++;return{addColorStop(){}};}
  },{get(t,k){return k in t?t[k]:()=>{}}});
  const renderer={inspiration:s.inspiration,hero:s.hero,cfg:CONFIG,clock:3,
    getGlow(){return{};}};
  const fx=new InspirationFx(renderer);
  fx.drawBack(ctx,0,0);
  fx.drawFront(ctx,0,0);
  const g=s.gem('green',100,70);g.inspired=true;g.inspireT=.5;
  g.prevX=120;g.prevY=65;
  fx.drawGem(ctx,g,g.x,g.y);
  assert.ok(calls.gradients>=2);
  assert.ok(calls.strokes>12);
  assert.ok(calls.glows>5);
  assert.ok(calls.fills>0);
});
