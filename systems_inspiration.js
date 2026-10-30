// Воодушевление: золото притягивает опыт, а ветви модов отвечают своей магией.
// У каждой способности свой носитель стихий и собственные усилители Х2/Х3, Мощь и Ускорение.
import { applyKnockback } from './world_enemy.js';
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class Inspiration {
  constructor({config,hero,gems,bus,enemies,combat,xp,arena,ignite,chill,zap}){
    this.config=config;
    this.cfg=config.skills.inspiration;
    this.hero=hero;
    this.gems=gems;
    this.bus=bus;
    this.enemies=enemies||{items:[]};
    this.combat=combat||null;
    this.xp=xp||null;
    this.arena=arena||null;
    this.ignite=ignite||null;
    this.chill=chill||null;
    this.zap=zap||null;
    this.source={active:true,inspiration:true};
    this.reset();
  }

  reset(){
    this.active=false;
    this.remaining=0;
    this.elapsed=0;
    this.pulse=0;
    this.collected=0;
    this.absorbedUnits=0;
    this.healed=0;
    this.mods=null;
    this.projectiles=[];
    this.dissolves=[];
    this.extractions=[];
    this.gravityWave=0;
    this.laserAge=0;
    this.laserCount=0;
    this.laserTick=0;
    this.laserAngle=0;
    this.laserStarted=false;
  }

  get auraWhole(){return this.active&&this.remaining>0&&!!this.mods?.aura;}

  begin(mods=null){
    if(!this.hero.active)return false;
    this.reset();
    this.mods=mods||{};
    const boost=clamp(1+(this.mods.inspirationPower?.percent||0)/100,1,12);
    this.active=true;
    this.remaining=Math.max(.1,this.cfg.duration*boost);
    this.pulse=1;
    if(this.mods.gravity)this.repelAll();
    if(this.mods.absorption)this.extractExperience();
    return true;
  }

  /** На старте Гравитация выталкивает ВСЕХ врагов, не только видимых. */
  repelAll(){
    this.gravityWave=Math.max(.05,this.cfg.gravityVisualTime);
    const h=this.hero;
    for(const e of this.enemies.items){
      if(!e?.active)continue;
      const dx=e.x-h.x,dy=e.y-h.y,len=Math.hypot(dx,dy);
      const a=len<.001?(e.gen||1)*2.399:Math.atan2(dy,dx);
      applyKnockback(e,Math.cos(a),Math.sin(a),
        this.cfg.gravityPush*this.gravityFactor(),this.cfg.gravityPushTime);
    }
  }

  gravityFactor(){
    const gravity=this.mods?.gravity;
    return Math.max(1,gravity?.durationMult||1);
  }

  /** Поглощение вытягивает по одной единице из нескольких РАЗНЫХ живых врагов.
   * Отмеченный моб больше не роняет опыт после смерти; запись сбрасывается при респавне. */
  extractExperience(){
    if(!this.xp||!this.combat)return;
    const a=this.mods.absorption;
    const limit=Math.min(this.config.absorption.maxTargets||64,
      Math.max(1,Math.floor(this.cfg.absorptionTargets*(a?.targets||1))));
    const available=[];
    const h=this.hero;
    for(const e of this.enemies.items)if(e?.active&&!e.inspirationDrained&&e.def?.drop)
      available.push(e);
    available.sort((a,b)=>Math.hypot(a.x-h.x,a.y-h.y)-Math.hypot(b.x-h.x,b.y-h.y));
    for(let i=0;i<Math.min(limit,available.length);i++){
      const e=available[i];
      e.inspirationDrained=true;
      this.xp.drop(e,'green',true); // принудительно ровно 1 XP, без случайного лечебного кристалла
      this.extractions.push({x:e.x,y:e.y,age:0,life:this.cfg.absorptionViewTime});
      const dmg=this.cfg.absorptionDamage*(a?.damage||1);
      this.combat.damageEnemy(e,dmg,this.source,null);
    }
  }

  /** Камень можно подобрать обычным образом, а вдохновлённый — ещё и получить 1 HP. */
  collectedGem(g){
    if(g.kind==='heal'||!g.inspired)return;
    this.collected++;
    const value=Math.max(0,Math.floor(g.def?.value||0));
    this.absorbedUnits+=value;
    const before=this.hero.hp;
    this.hero.hp=Math.min(this.hero.maxHp,before+1);
    const amount=this.hero.hp-before;
    this.healed+=amount;
    this.pulse=1;
    if(amount>0)this.bus.emit('hero:healed',{x:this.hero.x,y:this.hero.y,amount});
    if(!this.mods?.laser && (this.mods?.blades||this.hasRootElements()))
      this.releaseReturns(g.x,g.y,value);
  }

  hasRootElements(){
    const s=this.mods?.scopes?.root||this.mods||{};
    return !!(s.burn||s.frost||s.lightning);
  }

  /** Источники стихий изолированы: потомки Клинков/Лазера не усиливают соседние ветви. */
  elements(kind){
    const root=this.mods?.scopes?.root||this.mods||{};
    const own=this.mods?.scopes?.[kind]||{};
    return {
      burn:own.burn||root.burn||null,
      frost:own.frost||root.frost||null,
      lightning:own.lightning||root.lightning||null,
      steam:own.steam||root.steam||null,
    };
  }

  /** По возможности не больше трёх ОДНОВРЕМЕННЫХ клинков/огоньков на врага. */
  nearestTarget(x,y){
    let closest=null,best=Infinity;
    const cap=Math.max(1,this.cfg.maxPerEnemy);
    for(const e of this.enemies.items){
      if(!e?.active)continue;
      let allocated=0;
      for(const p of this.projectiles)
        if(p.target===e && p.gen===(e.gen||0))allocated++;
      if(allocated>=cap)continue;
      const dx=e.x-x,dy=e.y-y,d2=dx*dx+dy*dy;
      if(d2<best){closest=e;best=d2;}
    }
    return closest;
  }

  releaseReturns(x,y,value){
    const blades=!!this.mods?.blades;
    const multiple=blades?Math.max(1,Math.floor(this.mods.blades.max||1)):1;
    for(let i=0;i<value;i++){
      for(let j=0;j<multiple;j++){
        if(this.projectiles.length>=this.cfg.maxReturn)return;
        const e=this.nearestTarget(x,y);
        if(!e){
          if(this.dissolves.length<24)this.dissolves.push({x,y,age:0,life:.55,blade:blades});
          continue;
        }
        const angle=(i*2.399+j*1.43+this.elapsed*1.7);
        this.projectiles.push({x,y,px:x,py:y,angle,target:e,gen:e.gen||0,
          age:0,blade:blades,life:this.cfg.orbLifetime});
      }
    }
  }

  applyElements(e,kind){
    if(!e?.active)return;
    const el=this.elements(kind);
    const burn=el.burn,frost=el.frost,lightning=el.lightning;
    const bd=burn?this.cfg.orbDamage*this.config.burn.damageFrac*(burn.damage||1):0;
    const bi=this.config.burn.interval/Math.max(.01,burn?.rate||1);
    const steam=burn&&frost?(el.steam?.damage||1):0;
    if(burn&&this.ignite)this.ignite(e,bd,bi);
    if(frost&&e.active&&this.chill)this.chill(e,steam,bd,bi);
    if(lightning&&e.active&&this.zap)this.zap(e,bd,bi,frost?1:0,steam,lightning.mult||1);
  }

  updateProjectiles(dt){
    const list=this.projectiles;
    const speed=this.cfg.orbSpeed;
    for(let i=list.length-1;i>=0;i--){
      const p=list[i];p.age+=dt;
      p.px=p.x;p.py=p.y;
      if(p.age>=p.life){list.splice(i,1);continue;}
      let e=p.target;
      if(!e?.active||(e.gen||0)!==p.gen){
        // Цель исчезла: после её смерти огонёк выбирает новую, соблюдая лимит.
        list.splice(i,1);
        const next=this.nearestTarget(p.x,p.y);
        if(next){p.target=next;p.gen=next.gen||0;list.push(p);}
        else if(this.dissolves.length<24)this.dissolves.push({x:p.x,y:p.y,age:0,life:.4,blade:p.blade});
        continue;
      }
      const dx=e.x-p.x,dy=e.y-p.y;
      const d=Math.hypot(dx,dy)||1;
      const v=speed*(p.blade?1.35:1)*(1+.22*Math.min(1,p.age));
      p.angle=Math.atan2(dy,dx);
      const step=Math.min(d,v*dt);
      p.x+=dx/d*step;
      p.y+=dy/d*step;
      if(d-step>e.radius+5)continue;
      list.splice(i,1);
      const base=p.blade?this.cfg.bladeDamage:this.cfg.orbDamage;
      const m=p.blade?this.mods?.blades:null;
      const damage=base*(m?.damage||1);
      this.combat?.damageEnemy(e,damage,this.source,{knockback:p.blade?8:0,dirX:dx/d,dirY:dy/d});
      if(e.active)this.applyElements(e,p.blade?'blades':'root');
      if(this.dissolves.length<24)this.dissolves.push({x:p.x,y:p.y,age:0,life:.23,hit:true,blade:p.blade});
    }
  }

  /** Вращающиеся лучи: точное количество ceil(втянутые единицы XP / 3).
   * При любом числе лучей цель проверяется по ближайшему углу за O(1), а не N*количество лучей. */
  updateLasers(dt){
    if(!this.laserCount)return;
    this.laserAge+=dt;
    this.laserAngle+=dt*this.cfg.laserTurn*(this.mods.laser?.rate||1);
    const period=Math.max(.04,this.cfg.laserTick/Math.max(.05,this.mods.laser?.rate||1));
    this.laserTick+=dt;
    if(this.laserTick<period)return;
    this.laserTick%=period;
    const count=this.laserCount,step=TAU/count,angle=this.laserAngle;
    const range=Math.max(this.arena?.width||900,this.arena?.height||900)*1.5;
    const width=this.config.laser.width;
    const h=this.hero;
    for(const e of this.enemies.items){
      if(!e?.active)continue;
      const dx=e.x-h.x,dy=e.y-h.y,d=Math.hypot(dx,dy);
      if(d>range+e.radius||d<.001)continue;
      const theta=Math.atan2(dy,dx);
      const offset=((theta-angle+Math.PI)%step+step)%step-step/2;
      if(Math.abs(Math.sin(offset))*d>e.radius+width*.5)continue;
      this.combat?.damageEnemy(e,this.cfg.laserDamage*(this.mods.laser?.damage||1),this.source,null);
      if(e.active)this.applyElements(e,'laser');
    }
  }

  update(dt){
    if(!this.active)return;
    if(!this.hero.active){this.reset();return;}
    this.elapsed+=dt;
    this.remaining=Math.max(0,this.remaining-dt);
    this.pulse=Math.max(0,this.pulse-dt*3.8);
    this.gravityWave=Math.max(0,this.gravityWave-dt);
    this.updateProjectiles(dt);
    for(let i=this.dissolves.length-1;i>=0;i--){
      const p=this.dissolves[i];p.age+=dt;if(p.age>=p.life)this.dissolves.splice(i,1);
    }
    for(let i=this.extractions.length-1;i>=0;i--){
      const p=this.extractions[i];p.age+=dt;if(p.age>=p.life)this.extractions.splice(i,1);
    }
    if(this.remaining<=0 && this.mods?.laser && !this.laserStarted){
      // Сначала завершаем поглощение, потом включаем вращающийся лазер.
      let inflight=false;
      for(const g of this.gems.items)if(g.active&&g.inspired){inflight=true;break;}
      if(!inflight){
        this.laserStarted=true;
        this.laserCount=Math.ceil(this.absorbedUnits/3);
        this.laserAge=0;
        this.laserAngle=0;
        this.laserTick=0;
      }
    }
    if(this.laserCount && this.laserAge<this.cfg.laserTime)this.updateLasers(dt);
    const lasersDone=!this.laserCount||this.laserAge>=this.cfg.laserTime;
    if(this.remaining>0||!lasersDone||this.projectiles.length||this.extractions.length||this.dissolves.length)return;
    for(const g of this.gems.items)if(g.active&&g.inspired)return;
    this.active=false;
  }

  /** Изначальная дальняя притяжка камней опыта, с мягким спиральным ускорением к герою. */
  pull(g,dt){
    if(!this.hero.active||g.kind==='heal')return false;
    if(!g.inspired){
      if(!this.active||this.remaining<=0)return false;
      g.inspired=true;
      g.inspireT=0;
      g.inspireX=g.x;
      g.inspireY=g.y;
      g.inspireSeed=g.x*.013+g.y*.017+g.radius*1.29;
    }
    const total=Math.max(.15,this.cfg.travelTime);
    g.inspireT=Math.min(1,g.inspireT+dt/total);
    const p=g.inspireT,ease=p*p*(3-2*p);
    const hx=this.hero.x,hy=this.hero.y;
    const dx=g.inspireX-hx,dy=g.inspireY-hy;
    const dist=Math.hypot(dx,dy)||1;
    const nx=dx/dist,ny=dy/dist;
    const radius=Math.max(this.hero.radius+6,this.cfg.radius);
    const tx=hx+nx*(radius-g.radius*.35),ty=hy+ny*(radius-g.radius*.35);
    const spiral=Math.min(65,dist*.23)*Math.sin(Math.PI*p)*Math.sin(p*TAU*1.4+g.inspireSeed);
    g.x=g.inspireX+(tx-g.inspireX)*ease-ny*spiral;
    g.y=g.inspireY+(ty-g.inspireY)*ease+nx*spiral;
    g.pull=1;
    return p>=1;
  }
}
