// Освещение тёмного зала. Один маскирующий Canvas пониженного разрешения,
// одна кэшированная мягкая радиальная текстура и жёсткий бюджет источников.
// Никаких теневых лучей по врагам, отдельных фильтров на каждый снаряд или
// перерисовки полного экрана в DPR=3.
function canvas(w,h){
  if(typeof OffscreenCanvas==='function')return new OffscreenCanvas(w,h);
  const c=document.createElement('canvas');c.width=w;c.height=h;return c;
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class HallVision {
  constructor(config){
    this.cfg=config.hallVision;
    this.surface=null;
    this.mask=null;
    this.sprite=null;
    this.w=0;
    this.h=0;
    this.count=0;
    this.projectileCount=0;
    this.lastSources=0;
  }

  ensure(w,h){
    const scale=this.cfg.scale;
    const W=Math.max(1,Math.ceil(w*scale)),H=Math.max(1,Math.ceil(h*scale));
    if(!this.surface||this.surface.width!==W||this.surface.height!==H){
      this.surface=canvas(W,H);
      this.mask=this.surface.getContext('2d',{alpha:true});
    }
    if(!this.sprite){
      const S=128;
      this.sprite=canvas(S,S);
      const c=this.sprite.getContext('2d');
      const g=c.createRadialGradient(64,64,0,64,64,64);
      g.addColorStop(0,'rgba(255,255,255,1)');
      g.addColorStop(.27,'rgba(255,255,255,.99)');
      g.addColorStop(.53,'rgba(255,255,255,.88)');
      g.addColorStop(.77,'rgba(255,255,255,.34)');
      g.addColorStop(1,'rgba(255,255,255,0)');
      c.fillStyle=g;c.fillRect(0,0,S,S);
    }
    this.w=w;this.h=h;
  }

  light(x,y,radius=80,power=.8){
    if(this.count>=this.cfg.maxLights||!Number.isFinite(x)||!Number.isFinite(y))return false;
    const z=this.scale;
    const sx=(x-this.camX)*z+this.w*.5;
    const sy=(y-this.camY)*z+this.h*.5;
    const r=clamp(radius*z,8,Math.max(this.w,this.h)*2);
    if(sx+r<0||sx-r>this.w||sy+r<0||sy-r>this.h)return false;
    this.mask.globalAlpha=clamp(power,0,1);
    this.mask.drawImage(this.sprite,sx-r,sy-r,r*2,r*2);
    this.count++;
    return true;
  }

  list(items,max,radius,power,alpha=1,projectile=false){
    if(!items?.length||this.count>=this.cfg.maxLights)return;
    const step=Math.max(1,Math.ceil(items.length/max));
    let tried=0;
    for(let i=0;i<items.length&&tried<max;i+=step){
      if(this.count>=this.cfg.maxLights)break;
      if(projectile && this.projectileCount>=this.cfg.maxProjectiles)break;
      const p=items[i];
      if(!p||p.active===false||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
      const x=p.prevX===undefined?p.x:p.prevX+(p.x-p.prevX)*alpha;
      const y=p.prevY===undefined?p.y:p.prevY+(p.y-p.prevY)*alpha;
      if(this.light(x,y,radius,power)&&projectile)this.projectileCount++;
      tried++;
    }
  }

  /** Применяется только поверх мира и перед HUD, чтобы интерфейс не темнел. */
  draw(ctx,r,alpha=1){
    if(r.arena.location!=='hall')return;
    const w=r.w,h=r.h,cfg=this.cfg;
    this.ensure(w,h);
    this.camX=r.camera.x;this.camY=r.camera.y;
    this.scale=r.camera.scale||1;
    this.count=0;this.projectileCount=0;

    const c=this.mask;
    const sc=cfg.scale;
    c.setTransform(sc,0,0,sc,0,0);
    c.globalCompositeOperation='source-over';
    c.globalAlpha=1;
    c.fillStyle='rgba(4,7,16,'+cfg.darkness+')';
    c.clearRect(0,0,w+2,h+2);
    c.fillRect(0,0,w+2,h+2);
    c.globalCompositeOperation='destination-out';

    const hero=r.hero;
    if(hero.active){
      const hx=hero.prevX===undefined?hero.x:hero.prevX+(hero.x-hero.prevX)*alpha;
      const hy=hero.prevY===undefined?hero.y:hero.prevY+(hero.y-hero.prevY)*alpha;
      const base=r.cfg.attack.radius*cfg.staffRadius;
      // Сияние кристалла посоха, чуть меньше радиуса базовой атаки.
      this.light(hx,hy,base,.99);
      // Действующие навыки расширяют собственные освещённые области.
      if(r.hud?.rainT>0){
        // Магический дождь идёт по всему экрану, а не только возле героя.
        const across=Math.hypot(w,h)/Math.max(.1,this.scale);
        this.light(this.camX,this.camY,across*.54,.62);
      }
      if(hero.incarnationT>0||r.incarnation?.active)this.light(hx,hy,base*1.5,.9);
      if(r.inspiration?.active)this.light(hx,hy,Math.max(160,r.cfg.skills.inspiration.radius*2.3),.92);
      if(r.aura?.active)this.light(hx,hy,Math.max(cfg.spellRadius,r.aura.radius*1.12),.86);
      if(r.blackSun?.enabled)this.light(hx,hy,Math.max(150,r.aura?.radius||150),.8);
      if(r.defense?.gravityAuraMode)this.light(hx,hy,Math.max(120,r.defense.gravityAuraRadius||0),.73);
    }

    // Вражеские атаки всегда получают свет до заполнения бюджета эффектами героя.
    // Вражеские выстрелы и телеграфы полноценные источники света, а не декорации.
    this.list(r.enemyShots?.items,20,cfg.projectileRadius*1.35,.88,alpha,true);
    // Факелы и магические атаки Тартаса освещают зал во время боя.
    const boss=r.boss;
    const tartas=boss?.enemy;
    if(tartas?.active && tartas.def===r.cfg.enemies.tartas){
      for(const p of r.castleHall?.torches||[])this.light(p.x,p.y,190,.98);
      this.light(tartas.x,tartas.y,165,.88);
      for(let i=0;i<(boss.bladeCount||0)&&this.count<cfg.maxLights;i++){
        const blade=boss.blades[i];
        if(blade && blade.state>0 && blade.state<3)
          this.light(blade.x,blade.y,115,.92);
      }
      if(boss.state==='blastTele'||boss.state==='blast'||boss.state==='squadCast')
        this.light(tartas.x,tartas.y,260,.96);
    }
    if(r.enemies?.items){
      let attackLights=0;
      for(const e of r.enemies.items){
        if(!e.active || attackLights>=14 || this.count>=cfg.maxLights)continue;
        if(e.aim>0 || ['windup','strike'].includes(e.atk?.state)){
          if(this.light(e.x,e.y,e.def===r.cfg.enemies.battleMage?135:100,.74))attackLights++;
        }
      }
    }
    if(r.barriers?.active)for(const b of r.barriers.active){
      if(this.count>=cfg.maxLights)break;
      this.light(b.x,b.y,Math.max(95,cfg.spellRadius),.76);
      this.light(b.ax,b.ay,60,.5);
      this.light(b.bx,b.by,60,.5);
    }
    this.list(r.midges?.items,12,48,.58,alpha,true);

    // Крупные стационарные заклинания раньше мелких снарядов: гарантируем свет навыков.
    this.list(r.absorption?.targets,10,cfg.spellRadius,.8);
    this.list(r.absorption?.flashes,8,cfg.spellRadius,.9);
    this.list(r.blackSun?.souls,10,78,.68);
    this.list(r.incarnation?.afterimages,7,100,.57);
    this.list(r.synergyCasts,8,cfg.spellRadius,.68);
    this.list(r.fires,10,140,.75);
    this.list(r.clouds,8,145,.55);
    this.list(r.synergyFlashes,8,cfg.spellRadius,.85);
    this.list(r.effects?.items,14,cfg.ambientRadius,.55,alpha);
    this.list(r.inspiration?.soulStreams,9,90,.75);
    this.list(r.inspiration?.impulses,8,140,.67);
    this.list(r.inspiration?.projectiles,14,85,.9,alpha,true);
    this.list(r.incarnation?.bladeItems,10,85,.74,alpha,true);
    this.list(r.blades,10,76,.78,alpha,true);
    this.list(r.kineticBlades,8,85,.8,alpha,true);

    // Длинные лазеры: три точки по длине каждого луча. Без построения полигона.
    if(r.lasers?.length)for(let i=0;i<r.lasers.length&&this.count<cfg.maxLights;i+=Math.max(1,Math.ceil(r.lasers.length/8))){
      const b=r.lasers[i];
      if(!b||b.active===false)continue;
      const x0=b.x??b.x0??hero.x,y0=b.y??b.y0??hero.y;
      const x1=b.len!==undefined?x0+(b.dx||0)*b.len:(b.x1??x0);
      const y1=b.len!==undefined?y0+(b.dy||0)*b.len:(b.y1??y0);
      for(let j=1;j<=3&&this.count<cfg.maxLights;j++)
        this.light(x0+(x1-x0)*j/3,y0+(y1-y0)*j/3,105,.64);
    }
    for(const group of [r.zapBolts,r.dashBeams]){
      if(!group?.length)continue;
      const step=Math.max(1,Math.ceil(group.length/7));
      for(let i=0;i<group.length&&this.count<cfg.maxLights;i+=step){
        const b=group[i];
        if(!b)continue;
        const x0=b.x0??b.x,y0=b.y0??b.y;
        const x1=b.x1??b.x,y1=b.y1??b.y;
        if(!Number.isFinite(x0)||!Number.isFinite(y0)||!Number.isFinite(x1)||!Number.isFinite(y1))continue;
        this.light((x0+x1)*.5,(y0+y1)*.5,Math.max(78,Math.hypot(x1-x0,y1-y0)*.58),.78);
      }
    }

    // Отображаемые снаряды. Бюджет общий, так что сотни дробинок
    // не вызывают сотни полупрозрачных кругов в каждом кадре.
    this.list(r.heroShots?.items,20,cfg.projectileRadius,.76,alpha,true);
    const pe=r.pellets;
    if(pe?.n>0&&this.count<cfg.maxLights){
      const step=Math.max(1,Math.ceil(pe.n/12));
      for(let i=0;i<pe.n&&this.projectileCount<cfg.maxProjectiles&&this.count<cfg.maxLights;i+=step){
        const x=pe.px[i]+(pe.x[i]-pe.px[i])*alpha;
        const y=pe.py[i]+(pe.y[i]-pe.py[i])*alpha;
        if(this.light(x,y,42,.48))this.projectileCount++;
      }
    }
    this.lastSources=this.count;
    c.globalCompositeOperation='source-over';
    c.globalAlpha=1;
    // Маска выводится уже в CSS-пикселях; DPR главного холста не влияет на цену света.
    ctx.save();
    ctx.setTransform(r.dpr,0,0,r.dpr,0,0);
    ctx.drawImage(this.surface,0,0,w,h);
    ctx.restore();
  }
}
