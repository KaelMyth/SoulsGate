// Переход из северного двора в замковый холл после Пепельного Арха.
// Никакой телепортации до завершения медленного открывания: дверь принимает героя
// только при касании проёма. Игровой прогресс (HP, опыт, билд) сохраняется.
export class CastleTransition {
  constructor({arena,hero,spawner,onEnter,config}) {
    this.arena=arena;
    this.hero=hero;
    this.spawner=spawner;
    this.onEnter=onEnter;
    this.cfg=config.arena.castleTransition;
    this.reset();
  }

  reset(){
    this.stage='locked'; // locked | opening | ready | hall
    this.openTime=0;
    this.open=0;
    this.entered=false;
  }

  bossDefeated(wave){
    if(wave!==this.cfg.afterWave || this.stage!=='locked' || this.arena.location!=='courtyard')return false;
    this.stage='opening';
    this.openTime=0;
    this.open=0;
    return true;
  }

  get arrow(){
    if(this.stage!=='opening'&&this.stage!=='ready')return null;
    return {x:0,y:this.arena.walkTop,opening:this.stage==='opening'};
  }

  update(dt){
    if(this.stage!=='opening'&&this.stage!=='ready')return false;
    if(this.stage==='opening'){
      this.openTime+=Math.max(0,dt);
      const t=Math.min(1,this.openTime/Math.max(.01,this.cfg.openTime));
      // Массивные створки: сначала медленно срываются, затем набирают скорость,
      // под конец снова тормозят.
      this.open=t*t*(3-2*t);
      if(t>=1){this.stage='ready';this.open=1;}
    }
    if(this.stage!=='ready'||!this.hero.active)return false;
    const h=this.hero;
    const touching=Math.abs(h.x)<=this.cfg.touchHalfWidth &&
      h.y-h.radius<=this.arena.walkTop+this.cfg.touchDistance;
    if(!touching)return false;
    this.stage='hall';
    this.entered=true;
    this.onEnter?.();
    return true;
  }
}
