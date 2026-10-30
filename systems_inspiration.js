// Воодушевление: третье активное умение. Золотая сфера забирает камни опыта
// со всей карты, один собранный камень восстанавливает ровно 1 HP.
const TAU=Math.PI*2;
export class Inspiration {
  constructor({config,hero,gems,bus}){
    this.cfg=config.skills.inspiration;
    this.hero=hero;
    this.gems=gems;
    this.bus=bus;
    this.reset();
  }

  reset(){
    this.active=false;
    this.remaining=0;
    this.elapsed=0;
    this.pulse=0;
    this.collected=0;
    this.healed=0;
  }

  begin(){
    if(!this.hero.active)return false;
    this.active=true;
    this.remaining=Math.max(.1,this.cfg.duration);
    this.elapsed=0;
    this.pulse=1;
    this.collected=0;
    this.healed=0;
    return true;
  }

  /** Уже начавшееся втягивание обязательно завершается, даже после окончания свечения. */
  update(dt){
    if(!this.active)return;
    if(!this.hero.active){this.reset();return;}
    this.elapsed+=dt;
    this.remaining=Math.max(0,this.remaining-dt);
    this.pulse=Math.max(0,this.pulse-dt*3.8);
    if(this.remaining>0)return;
    for(const g of this.gems.items)if(g.active && g.inspired)return;
    this.active=false;
  }

  /** Притягиваем с любой дистанции: не зависит от радиуса обычного магнита. */
  pull(g,dt){
    if(!this.hero.active || g.kind==='heal')return false;
    if(!g.inspired){
      if(!this.active || this.remaining<=0)return false;
      g.inspired=true;
      g.inspireT=0;
      g.inspireX=g.x;
      g.inspireY=g.y;
      g.inspireSeed=(g.x*.013+g.y*.017+g.radius*1.29);
    }
    const total=Math.max(.15,this.cfg.travelTime);
    g.inspireT=Math.min(1,g.inspireT+dt/total);
    const p=g.inspireT;
    const ease=p*p*(3-2*p);
    const hx=this.hero.x,hy=this.hero.y;
    const dx=g.inspireX-hx,dy=g.inspireY-hy;
    const dist=Math.hypot(dx,dy)||1;
    const nx=dx/dist,ny=dy/dist;
    const radius=Math.max(this.hero.radius+6,this.cfg.radius);
    const targetX=hx+nx*(radius-g.radius*.35),targetY=hy+ny*(radius-g.radius*.35);
    const spiral=Math.min(65,dist*.23)*Math.sin(Math.PI*p)*
      Math.sin(p*TAU*1.4+g.inspireSeed);
    g.x=g.inspireX+(targetX-g.inspireX)*ease-ny*spiral;
    g.y=g.inspireY+(targetY-g.inspireY)*ease+nx*spiral;
    g.pull=1;
    return p>=1;
  }

  /** Отдельный камень = 1 HP. Красный (5 XP) также даёт ровно 1 HP. */
  collectedGem(g){
    if(g.kind==='heal' || !g.inspired)return;
    this.collected++;
    const before=this.hero.hp;
    this.hero.hp=Math.min(this.hero.maxHp,before+1);
    const amount=this.hero.hp-before;
    this.healed+=amount;
    this.pulse=1;
    if(amount>0)this.bus.emit('hero:healed',{x:this.hero.x,y:this.hero.y,amount});
  }
}
