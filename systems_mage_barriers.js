// Непробиваемая магическая мембрана перед троицей лучников.
// Работает только при живом маге того же поколения пула. Обойти можно с фланга.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class MageBarriers {
  constructor(config){this.cfg=config.mageBarrier;this.active=[];}
  reset(){this.active.length=0;}
  add(mage,archers,hero){
    const dx=hero.x-mage.x,dy=hero.y-mage.y,d=Math.hypot(dx,dy)||1;
    const nx=dx/d,ny=dy/d;
    const b={mage,gen:mage.gen,archers:archers.map(e=>({e,gen:e.gen})),
      nx,ny,age:0,x:0,y:0,ax:0,ay:0,bx:0,by:0};
    this.active.push(b);
    this.position(b);
  }
  position(b){
    b.x=b.mage.x+b.nx*this.cfg.forward;
    b.y=b.mage.y+b.ny*this.cfg.forward;
    const r=this.cfg.width*.5;
    b.ax=b.x-b.ny*r;b.ay=b.y+b.nx*r;
    b.bx=b.x+b.ny*r;b.by=b.y-b.nx*r;
  }
  update(dt){
    for(let i=this.active.length-1;i>=0;i--){
      const b=this.active[i],mage=b.mage;
      if(!mage.active||mage.gen!==b.gen||mage.hp<=0){
        for(const {e,gen} of b.archers)
          if(e.active&&e.gen===gen)e.goalOn=false;
        this.active.splice(i,1);continue;
      }
      b.age+=dt;this.position(b);
    }
  }
  intersection(x0,y0,x1,y1,pad=0){
    const dx=x1-x0,dy=y1-y0;
    let best=null;
    for(const b of this.active){
      if(!b.mage.active||b.mage.gen!==b.gen)continue;
      const qx=b.bx-b.ax,qy=b.by-b.ay,det=dx*qy-dy*qx;
      if(Math.abs(det)<1e-8)continue;
      const ex=b.ax-x0,ey=b.ay-y0;
      const t=(ex*qy-ey*qx)/det,u=(ex*dy-ey*dx)/det;
      // Толщина заряда увеличивает перехватываемую ширину щита.
      const slack=pad/Math.max(1,this.cfg.width);
      if(t>=0&&t<=1&&u>=-slack&&u<=1+slack&&(!best||t<best.t))
        best={t:clamp(t,0,1),x:x0+dx*clamp(t,0,1),y:y0+dy*clamp(t,0,1)};
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
  draw(ctx,clock){
    for(const b of this.active){
      const pulse=.8+.12*Math.sin(clock*5+b.age*3);
      ctx.save();ctx.lineCap='round';ctx.globalCompositeOperation='lighter';
      for(const [col,w] of [['rgba(87,91,219,.2)',15],['rgba(147,136,255,.48)',6*pulse],['rgba(238,220,255,.88)',1.5]]){
        ctx.strokeStyle=col;ctx.lineWidth=w;
        ctx.beginPath();ctx.moveTo(b.ax,b.ay);ctx.lineTo(b.bx,b.by);ctx.stroke();
      }
      for(let i=0;i<=6;i++){
        const t=i/6,x=b.ax+(b.bx-b.ax)*t,y=b.ay+(b.by-b.ay)*t;
        ctx.fillStyle=i%2?'#8d8cf9':'#e8d9ff';
        ctx.beginPath();ctx.arc(x,y,2.1+Math.sin(clock*4+i)*.3,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
  }
}
