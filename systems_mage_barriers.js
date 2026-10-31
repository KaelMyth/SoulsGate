// Магическая мембрана-полукруг перед троицей лучников.
// Щит движется с магом, но навсегда сохраняет направление в момент призыва.
// Обойти можно с фланга и с тыла.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class MageBarriers {
  constructor(config){this.cfg=config.mageBarrier;this.active=[];}
  reset(){this.active.length=0;}
  add(mage,archers,hero){
    const dx=hero.x-mage.x,dy=hero.y-mage.y,d=Math.hypot(dx,dy);
    // Если герой совпал с точкой появления мага, сохраняем корректную единичную ось.
    const nx=d>1e-4?dx/d:1,ny=d>1e-4?dy/d:0;
    const b={mage,gen:mage.gen,hero,archers:archers.map(e=>({e,gen:e.gen})),
      nx,ny,                 // направление строя лучников: они продолжают следовать за магом
      shieldNx:nx,shieldNy:ny, // направление щита фиксировано при появлении и не поворачивается
      age:0,x:0,y:0,radius:this.cfg.width*.5};
    this.active.push(b);
    this.position(b);
  }
  position(b){
    // Перемещаем полукруг вместе с магом, но не меняем его исходную ориентацию.
    b.x=b.mage.x+b.shieldNx*this.cfg.forward;
    b.y=b.mage.y+b.shieldNy*this.cfg.forward;
  }
  /** Перед движением врагов: лучники перестраиваются за магом, щит не поворачивается. */
  updateFormation() {
    for (const b of this.active) {
      const mage = b.mage;
      if (!mage.active || mage.gen !== b.gen || mage.hp <= 0) continue;
      const hero = b.hero;
      const dx = hero.x - mage.x, dy = hero.y - mage.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-4) { b.nx = dx / d; b.ny = dy / d; }
      const back = this.cfg.archerBehind ?? 70;
      const spacing = this.cfg.archerSpacing ?? 48;
      const n = b.archers.length;
      for (let j = 0; j < n; j++) {
        const {e, gen} = b.archers[j];
        if (!e.active || e.gen !== gen) continue;
        const side = (j - (n - 1) * 0.5) * spacing;
        e.goalOn = true;
        e.goalX = mage.x - b.nx * back - b.ny * side;
        e.goalY = mage.y - b.ny * back + b.nx * side;
      }
    }
  }

  update(dt){
    for(let i=this.active.length-1;i>=0;i--){
      const b=this.active[i],mage=b.mage;
      if(!mage.active||mage.gen!==b.gen||mage.hp<=0){
        for(const {e,gen} of b.archers)
          if(e.active&&e.gen===gen)e.goalOn=false;
        this.active.splice(i,1);continue;
      }
      const hero=b.hero, dx=hero.x-mage.x, dy=hero.y-mage.y;
      const d=Math.hypot(dx,dy);
      if(d>1e-4){b.nx=dx/d;b.ny=dy/d;}
      b.age+=dt;this.position(b);
    }
  }
  /** Пересечение отрезка с передней половиной окружности. Ровно эта дуга и нарисована.
   *  pad учитывает радиус снаряда/героя. Работает с обеих сторон полукруга. */
  intersection(x0,y0,x1,y1,pad=0){
    const dx=x1-x0,dy=y1-y0;
    const lenSq=dx*dx+dy*dy;
    if(lenSq<1e-10)return null;
    let best=null;
    for(const b of this.active){
      if(!b.mage.active||b.mage.gen!==b.gen||b.mage.hp<=0)continue;
      const ox=x0-b.x,oy=y0-b.y;
      const radius=b.radius+Math.max(0,pad);
      const along=ox*dx+oy*dy;
      const disc=along*along-lenSq*(ox*ox+oy*oy-radius*radius);
      if(disc<0)continue;
      const root=Math.sqrt(disc);
      const start=(-along-root)/lenSq,end=(-along+root)/lenSq;
      // Обе точки проверяются: при движении изнутри полукруга важна выходная.
      for(let k=0;k<2;k++){
        const t=k===0?start:end; // без массива в горячем цикле пересечений
        if(t<0||t>1||best&&t>=best.t)continue;
        const hx=ox+dx*t,hy=oy+dy*t;
        if(hx*b.shieldNx+hy*b.shieldNy < -Math.max(0,pad))continue;
        best={t,x:x0+dx*t,y:y0+dy*t};
      }
    }
    return best;
  }
  // Фронтальная преграда также не даёт герою пройти сквозь неё.
  blockHero(hero){
    if(!hero.active || !Number.isFinite(hero.prevX)||!Number.isFinite(hero.prevY))return;
    const oldX=hero.prevX,oldY=hero.prevY;
    const hit=this.intersection(oldX,oldY,hero.x,hero.y,hero.radius);
    if(hit){
      const dx=hero.x-oldX,dy=hero.y-oldY,len=Math.hypot(dx,dy)||1;
      hero.x=hit.x-dx/len*(hero.radius+4);
      hero.y=hit.y-dy/len*(hero.radius+4);
    }
  }
  interceptShot(p){
    const hit=this.intersection(p.prevX,p.prevY,p.x,p.y,p.radius||0);
    if(!hit)return false;
    p.x=hit.x;p.y=hit.y;p.active=false;return true;
  }
  interceptPellet(x0,y0,x1,y1,r){return !!this.intersection(x0,y0,x1,y1,r);}
  cutRay(x,y,dx,dy,length,width=0){
    const h=this.intersection(x,y,x+dx*length,y+dy*length,width*.5);
    return h?Math.max(0,length*h.t):length;
  }
  /** Полукруглая магическая оболочка с мягкой подсветкой и тонкими рунами по дуге. */
  draw(ctx,clock){
    const PI=Math.PI;
    for(const b of this.active){
      if(!b.mage.active||b.mage.gen!==b.gen||b.mage.hp<=0)continue;
      const pulse=.8+.12*Math.sin(clock*5+b.age*3);
      const angle=Math.atan2(b.shieldNy,b.shieldNx);
      const start=angle-PI*.5,end=angle+PI*.5;
      const r=b.radius;
      ctx.save();
      ctx.lineCap='round';
      ctx.globalCompositeOperation='lighter';
      // Тонкая полупрозрачная мембрана заполняет переднюю половину круга.
      ctx.fillStyle='rgba(92,90,184,.075)';
      ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.arc(b.x,b.y,r,start,end);ctx.closePath();ctx.fill();
      // Три слоя обводки создают объём и свечение, не меняя графический стиль.
      for(const [col,w] of [['rgba(87,91,219,.2)',15],['rgba(147,136,255,.48)',6*pulse],['rgba(238,220,255,.88)',1.5]]){
        ctx.strokeStyle=col;ctx.lineWidth=w;
        ctx.beginPath();ctx.arc(b.x,b.y,r,start,end);ctx.stroke();
      }
      // Отдельные частицы строго вдоль дуги, а не на прежней прямой.
      for(let i=0;i<=8;i++){
        const a=start+(end-start)*i/8;
        const x=b.x+Math.cos(a)*r,y=b.y+Math.sin(a)*r;
        ctx.fillStyle=i%2?'#8d8cf9':'#e8d9ff';
        ctx.beginPath();ctx.arc(x,y,2.1+Math.sin(clock*4+i)*.3,0,PI*2);ctx.fill();
      }
      ctx.restore();
    }
  }
}
