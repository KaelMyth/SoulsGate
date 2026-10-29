// Тройная синергия Щита: Аура + Гравитация + Поглощение.
// Пассивная аура сохраняет свои тики/касты. Десять поглощённых душ
// заряжают имплозию, каждая душа втягивается в центр независимо от остальных.
export class BlackSun {
  constructor({config,hero,aura,enemies,combat,modifiers}) {
    this.cfg=config;
    this.hero=hero;
    this.aura=aura;
    this.enemies=enemies;
    this.combat=combat;
    this.modifiers=modifiers;
    this.source={active:true,blackSun:true};
    this.reset();
  }

  reset() {
    this.enabled=false;
    this.phase='passive'; // passive | collapse | burst
    this.time=0;
    this.souls=[]; // души, летящие по спирали в Чёрное солнце
    this.soulsStored=0; // заряд только после того, как душа вошла в ядро
    this.soulPulse=0;
    this.burstX=0;
    this.burstY=0;
    this.burstRadius=0;
    this.soulsConsumed=0;
  }

  sync() {
    const m=this.modifiers?.(this.cfg.block.core);
    // Проверяем один и тот же владеющий ядром Щит, а не наличие модов где-либо на поле.
    const enabled=!!(this.hero.active && this.aura.active && m?.aura && m?.gravity && m?.absorption);
    if(!enabled && this.enabled) this.reset();
    this.enabled=enabled;
    return enabled;
  }

  /** Душа появляется на месте смерти и втягивается к солнцу. Одновременно летят до 10 душ. */
  onEnemyKilled(enemy) {
    if(!this.sync() || this.phase!=='passive' || !enemy) return false;
    const limit=Math.max(1,this.cfg.blackSun.soulsRequired|0);
    if(this.soulsStored+this.souls.length>=limit) return false;
    const dx=enemy.x-this.hero.x,dy=enemy.y-this.hero.y;
    const r=this.aura.radius+Math.max(0,enemy.radius||0);
    if(dx*dx+dy*dy>r*r) return false;
    this.souls.push({x:enemy.x,y:enemy.y,radius:enemy.radius||10,
      seed:(enemy.gen||0)*2.37+this.souls.length*.83,time:0});
    return true;
  }

  burst() {
    const B=this.cfg.blackSun;
    const x=this.hero.x,y=this.hero.y;
    const radius=Math.max(B.minRadius,this.aura.radius*B.radiusMul);
    this.burstX=x;this.burstY=y;this.burstRadius=radius;
    this.phase='burst'; // до урона: смерти от импульса не вызывают рекурсию
    this.time=0;
    this.souls.length=0;
    this.soulsStored=0;
    this.soulPulse=1;
    this.soulsConsumed++;
    const source=this.source;
    for(const enemy of this.enemies.items) {
      if(!enemy?.active) continue;
      const dx=enemy.x-x,dy=enemy.y-y;
      const hit=radius+Math.max(0,enemy.radius||0);
      if(dx*dx+dy*dy<=hit*hit) this.combat.damageEnemy(enemy,B.damage,source,null);
    }
  }

  update(dt) {
    if(!this.sync()) return;
    this.soulPulse=Math.max(0,this.soulPulse-dt*2.7);
    if(this.phase==='passive') {
      const lifetime=Math.max(.05,this.cfg.blackSun.soulTime);
      for(let i=this.souls.length-1;i>=0;i--) {
        const soul=this.souls[i];
        soul.time+=Math.max(0,dt);
        if(soul.time<lifetime) continue;
        this.souls.splice(i,1);
        this.soulsStored++;
        this.soulPulse=1;
      }
      if(this.soulsStored>=Math.max(1,this.cfg.blackSun.soulsRequired|0)) {
        this.souls.length=0;
        this.phase='collapse';
        this.time=0;
      }
      return;
    }
    let left=Math.max(0,dt);
    for(let guard=0;guard<3 && this.phase!=='passive';guard++) {
      const duration=this.phase==='collapse'?this.cfg.blackSun.collapseTime:this.cfg.blackSun.burstTime;
      const span=Math.max(.01,duration);
      const move=Math.min(left,Math.max(0,span-this.time));
      this.time+=move;
      left-=move;
      if(this.time<span-.000001)break;
      if(this.phase==='collapse') this.burst();
      else {this.phase='passive';this.time=0;}
      if(left<=0) break;
    }
  }
}
