// Воодушевление: поглощение опыта и модульные ответные заклинания.
import { applyKnockback } from './world_enemy.js';
import { forCarrier } from './build_scopes.js';

const TAU = Math.PI * 2;
export class Inspiration {
  constructor({config,hero,gems,bus}) {
    this.config=config;
    this.cfg=config.skills.inspiration;
    this.hero=hero;
    this.gems=gems;
    this.bus=bus;
    this.source={active:true,inspiration:true,el:0};
    this.enemies=null;
    this.combat=null;
    this.arena=null;
    this.extractXp=null;
    this.ignite=null;
    this.chill=null;
    this.zap=null;
    this.reset();
  }

  bind({enemies,combat,arena,extractXp,ignite,chill,zap}) {
    Object.assign(this,{enemies,combat,arena,extractXp,ignite,chill,zap});
  }

  reset() {
    this.active=false;
    this.remaining=0;
    this.elapsed=0;
    this.pulse=0;
    this.collected=0;
    this.healed=0;
    this.mods={};
    this.bolts=[];
    this.assigned=new Map();
    this.impulses=[];
    this.soulStreams=[];
    this.laserCount=0;
    this.laserPhase=0;
    this.laserAngle=0;
    this.laserTimer=0;
    this.laserStarted=false;
    this.auraTimer=0;
  }

  begin(modifiers={}) {
    if(!this.hero.active)return false;
    this.reset();
    this.active=true;
    this.mods=forCarrier(modifiers,'root');
    this.remaining=Math.max(.1,this.cfg.duration);
    this.pulse=1;
    const enemies=this.enemies?.items || [];
    if(this.mods.gravity) {
      for(let i=0;i<enemies.length;i++) {
        const e=enemies[i];
        if(!e.active)continue;
        const dx=e.x-this.hero.x,dy=e.y-this.hero.y;
        const angle=Math.atan2(dy,dx)+(dx||dy?0:i*.37);
        applyKnockback(e,Math.cos(angle),Math.sin(angle),this.cfg.gravityPush,.18,true);
        this.impulses.push({x:e.x,y:e.y,r:e.radius,time:.62});
      }
    }
    if(this.mods.absorption && this.extractXp) {
      // Сначала помечаем душу использованной, затем наносим урон: смертельный удар
      // не должен породить вторую награду из enemy:killed.
      for(const e of [...enemies]) {
        if(!e.active || e.xpExhausted)continue;
        const g=this.extractXp(e);
        if(!g)continue;
        this.soulStreams.push({x:e.x,y:e.y,time:1,seed:this.soulStreams.length*.77});
        const bonus=this.mods.absorption.damage || 1;
        const hit=this.combat?.damageEnemy(e,this.cfg.absorptionDamage*bonus,this.source,null);
        if(hit && e.active)this.applyElements(e,forCarrier(this.mods,'absorption'));
      }
    }
    return true;
  }

  hasIncoming() {
    return this.gems.items.some(g=>g.active && g.inspired);
  }

  update(dt) {
    if(!this.active)return;
    if(!this.hero.active){this.reset();return;}
    this.elapsed+=dt;
    this.remaining=Math.max(0,this.remaining-dt);
    this.pulse=Math.max(0,this.pulse-dt*3.8);
    for(let i=this.impulses.length-1;i>=0;i--) {
      if((this.impulses[i].time-=dt)<=0)this.impulses.splice(i,1);
    }
    for(let i=this.soulStreams.length-1;i>=0;i--) {
      if((this.soulStreams[i].time-=dt)<=0)this.soulStreams.splice(i,1);
    }
    this.updateBolts(dt);
    if(this.mods.aura && this.remaining>0) {
      const rate=Math.max(.2,this.config.aura.ticks*(this.mods.aura.rate||1));
      this.auraTimer+=dt;
      for(let n=0;this.auraTimer>=1/rate && n<8;n++) {
        this.auraTimer-=1/rate;
        for(const e of this.enemies?.items || []) {
          if(!e.active)continue;
          this.combat.damageEnemy(e,this.config.aura.damage*(this.mods.aura.damage||1),this.source,null);
          if(e.active)this.applyElements(e,forCarrier(this.mods,'aura'));
        }
      }
    }
    // Лазеры появляются после того, как последний кристалл уже долетел.
    if(this.remaining===0 && !this.hasIncoming() && this.mods.laser && !this.laserStarted) {
      this.laserStarted=true;
      const countMul=Math.max(1,Math.round(1+(this.mods.count?.percent||0)/100));
      this.laserCount=Math.ceil(this.collected/3)*countMul;
      this.laserPhase=this.laserCount>0 ? this.cfg.laserDuration : 0;
      this.laserAngle=0;
      this.laserTimer=0;
    }
    if(this.laserPhase>0) {
      this.laserPhase=Math.max(0,this.laserPhase-dt);
      this.laserAngle+=dt*this.cfg.laserSpeed;
      const lmods=this.mods.laser || {};
      const interval=Math.max(.08,this.config.laser.interval/(lmods.rate||1));
      this.laserTimer+=dt;
      for(let n=0;this.laserTimer>=interval && n<8;n++) {
        this.laserTimer-=interval;
        this.tickLasers(lmods);
      }
    }
    if(this.remaining===0 && !this.hasIncoming() && !this.bolts.length && this.laserPhase<=0)this.active=false;
  }

  selectTarget(x,y) {
    let pick=null,dist=Infinity,minLoad=Infinity;
    for(const e of this.enemies?.items || []) {
      if(!e.active)continue;
      const old=this.assigned.get(e);
      const count=old && old.gen===e.gen ? old.count : 0;
      const d=(e.x-x)**2+(e.y-y)**2;
      // Пока можно распределить по 3 на цель, не перегружаем одного врага.
      const load=count>=3?1:0;
      if(load<minLoad || (load===minLoad && d<dist)) {
        pick=e;dist=d;minLoad=load;
      }
    }
    if(pick) {
      const old=this.assigned.get(pick);
      this.assigned.set(pick,{gen:pick.gen,count:(old?.gen===pick.gen?old.count:0)+1});
    }
    return pick;
  }

  releaseTarget(b) {
    const e=b.target,old=e && this.assigned.get(e);
    if(old && old.gen===b.gen)old.count=Math.max(0,old.count-1);
  }

  spawnBolt(g) {
    const target=this.selectTarget(g.x,g.y);
    const blade=!!this.mods.blades;
    const eMods=forCarrier(this.mods,blade?'blades':'root');
    const mask=(eMods.burn?1:0)|(eMods.frost?2:0)|(eMods.lightning?4:0);
    this.bolts.push({x:g.x,y:g.y,px:g.x,py:g.y,target,gen:target?.gen,
      blade,mask,age:0,fade:target?0:.4,seed:this.collected*2.399,
      speed:this.cfg.orbSpeed*(blade?(this.mods.blades.rate||1):1)});
  }

  updateBolts(dt) {
    for(let i=this.bolts.length-1;i>=0;i--) {
      const b=this.bolts[i];
      b.age+=dt;b.px=b.x;b.py=b.y;
      if(b.fade>0 || !b.target) {
        b.fade-=dt;
        if(b.fade<=0)this.bolts.splice(i,1);
        continue;
      }
      if(!b.target.active || b.target.gen!==b.gen) {
        this.releaseTarget(b);
        b.target=this.selectTarget(b.x,b.y);
        b.gen=b.target?.gen;
        if(!b.target){b.fade=.32;continue;}
      }
      const dx=b.target.x-b.x,dy=b.target.y-b.y,d=Math.hypot(dx,dy);
      const step=Math.min(d,b.speed*dt);
      if(d>0) {b.x+=dx/d*step;b.y+=dy/d*step;}
      if(d>this.cfg.orbImpactRadius+b.target.radius && step<d)continue;
      this.releaseTarget(b);
      const mods=forCarrier(this.mods,b.blade?'blades':'root');
      const bonus=b.blade?(this.mods.blades.damage||1):1;
      const rootDamage=1+(this.mods.damage?.percent||0)/100;
      const dmg=(b.blade?this.cfg.bladeDamage:this.cfg.orbDamage)*bonus*rootDamage;
      this.source.el=b.mask;
      const hit=this.combat?.damageEnemy(b.target,dmg,this.source,null);
      if(hit && b.target.active)this.applyElements(b.target,mods);
      b.target=null;b.fade=.24;
    }
  }

  applyElements(e,mods) {
    const burn=mods.burn, frost=mods.frost, lightning=mods.lightning;
    const bd=burn?this.cfg.orbDamage*this.config.burn.damageFrac*(burn.damage||1):0;
    const bi=burn?this.config.burn.interval/(burn.rate||1):0;
    const steam=burn&&frost?mods.steam?.damage||1:0;
    if(burn)this.ignite?.(e,bd,bi);
    if(frost && e.active)this.chill?.(e,steam,bd,bi);
    if(lightning && e.active)this.zap?.(e,bd,bi,!!frost,steam,lightning.mult||1);
  }

  tickLasers(lmods) {
    const n=this.laserCount,range=this.config.laser.length;
    if(!n)return;
    const sx=this.hero.x,sy=this.hero.y;
    const elements=forCarrier(this.mods,'laser');
    this.source.el=(elements.burn?1:0)|(elements.frost?2:0)|(elements.lightning?4:0);
    for(let i=0;i<n;i++) {
      const a=this.laserAngle+TAU*i/n;
      const dx=Math.cos(a),dy=Math.sin(a);
      for(const e of this.enemies?.items || []) {
        if(!e.active)continue;
        const px=e.x-sx,py=e.y-sy,t=px*dx+py*dy;
        if(t<0 || t>range+e.radius || Math.abs(px*dy-py*dx)>this.config.laser.width*.65+e.radius)continue;
        if(this.arena?.segmentBlocked?.(sx,sy,e.x,e.y,2))continue;
        const hit=this.combat.damageEnemy(e,this.cfg.laserDamage*(lmods.damage||1),this.source,null);
        if(hit && e.active)this.applyElements(e,elements);
      }
    }
  }

  /** Уже начавшееся притяжение завершается даже после окончания свечения. */
  pull(g,dt) {
    if(!this.hero.active || g.kind==='heal')return false;
    if(!g.inspired) {
      if(!this.active || this.remaining<=0)return false;
      g.inspired=true;
      g.inspireT=0;
      g.inspireX=g.x;g.inspireY=g.y;
      g.inspireSeed=g.x*.013+g.y*.017+g.radius*1.29;
    }
    const total=Math.max(.15,this.cfg.travelTime);
    g.inspireT=Math.min(1,g.inspireT+dt/total);
    const p=g.inspireT,ease=p*p*(3-2*p);
    const hx=this.hero.x,hy=this.hero.y;
    const dx=g.inspireX-hx,dy=g.inspireY-hy;
    const dist=Math.hypot(dx,dy)||1,nx=dx/dist,ny=dy/dist;
    const radius=Math.max(this.hero.radius+6,this.cfg.radius);
    const targetX=hx+nx*(radius-g.radius*.35),targetY=hy+ny*(radius-g.radius*.35);
    const spiral=Math.min(65,dist*.23)*Math.sin(Math.PI*p)*Math.sin(p*TAU*1.4+g.inspireSeed);
    g.x=g.inspireX+(targetX-g.inspireX)*ease-ny*spiral;
    g.y=g.inspireY+(targetY-g.inspireY)*ease+nx*spiral;
    g.pull=1;
    return p>=1;
  }

  collectedGem(g) {
    if(g.kind==='heal'||!g.inspired)return;
    this.collected++;
    const before=this.hero.hp;
    this.hero.hp=Math.min(this.hero.maxHp,before+1);
    const healed=this.hero.hp-before;
    this.healed+=healed;this.pulse=1;
    if(healed>0)this.bus.emit('hero:healed',{x:this.hero.x,y:this.hero.y,amount:healed});
    if(this.active && (this.mods.burn||this.mods.frost||this.mods.lightning||this.mods.blades)) {
      const multi=this.mods.blades ? this.mods.blades.max||1 : 1+(this.mods.count?.percent||0)/100;
      for(let i=0;i<Math.max(1,Math.round(multi));i++)this.spawnBolt(g);
    }
  }
}
