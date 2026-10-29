// SoulsGate #153 — игровые модели частиц и кадровые анимации магии.
// Canvas 2D, без внешних картинок: цвета и прозрачность масштабируются с мировыми
// координатами, без больших текстур и отдельных аллокаций на каждый каст.
const TAU = Math.PI * 2;
const clamp = (x,a=0,b=1) => Math.max(a,Math.min(b,x));
const sm = x => x*x*(3-2*x);
const palettes = {
  blood: {bright:'240,151,189', edge:'129,42,100', smoke:'62,24,73', light:'255,204,217'},
  phantom: {bright:'195,166,255', edge:'120,75,204', smoke:'51,31,96', light:'241,225,255'},
  scarlet: {bright:'255,122,117', edge:'204,44,66', smoke:'98,22,39', light:'255,222,214'}
};
const rgba = (v,a) => 'rgba('+v+','+clamp(a)+')';

export class SpellFx {
  constructor() { this.sword = null; }

  haze(ctx,x,y,r,colors,alpha=1) {
    if (!(r>0) || alpha<=0) return;
    const gr=ctx.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,rgba(colors.bright,0.18*alpha));
    gr.addColorStop(0.32,rgba(colors.edge,0.2*alpha));
    gr.addColorStop(0.7,rgba(colors.smoke,0.13*alpha));
    gr.addColorStop(1,rgba(colors.smoke,0));
    ctx.fillStyle=gr;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  }

  // Тонкие ленточные вихри. Шум детерминирован: нет мерцания случайными кадрами.
  ribbons(ctx,x,y,r,t,alpha,colors,contract=false) {
    ctx.save();ctx.lineCap='round';ctx.globalCompositeOperation='lighter';
    for(let i=0;i<5;i++){
      const phase=t*(i%2?1.45:-1.25)+i*TAU/5;
      const a0=phase+(contract?0.9:0);
      const a1=a0+(contract?2.15:1.9);
      ctx.strokeStyle=rgba(i%2?colors.bright:colors.edge,alpha*(i%2?0.34:0.46));
      ctx.lineWidth=Math.max(0.7,r*0.065);
      ctx.beginPath();
      for(let j=0;j<=12;j++){
        const f=j/12;
        const a=a0+(a1-a0)*f;
        const rr=r*(contract?1.07-0.75*f:0.58+0.35*f);
        const wob=1+0.055*Math.sin(t*4+i*1.7+j*0.7);
        const px=x+Math.cos(a)*rr*wob,py=y+Math.sin(a)*rr*wob*0.73;
        if(j===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Единый каст Поглощения: засасывание тумана внутрь врага, узкий венец, искры.
  absorptionCharge(ctx,x,y,r,progress,time,mode='blood',seed=0) {
    const col=palettes[mode]||palettes.blood;
    const p=sm(clamp(progress));
    const R=r*(1.72-0.58*p);
    ctx.save();
    this.haze(ctx,x,y,R*1.7,col,0.75+0.25*p);
    this.ribbons(ctx,x,y,R,time+seed*0.13,0.5+0.4*p,col,true);
    ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=rgba(col.bright,0.18+0.45*p);ctx.lineWidth=1.25;
    for(let i=0;i<2;i++){
      ctx.beginPath();
      ctx.ellipse(x,y,R*(0.96-i*.2),R*(0.4-i*.07),time*(i?-.44:.32)+i,0,TAU);
      ctx.stroke();
    }
    for(let i=0;i<8;i++){
      const ang=i*2.399+seed*0.7+time*1.7;
      const rad=R*(0.8-0.67*p+0.1*Math.sin(i*4+time*3));
      const sx=x+Math.cos(ang)*rad,sy=y+Math.sin(ang)*rad*.7;
      const len=2.1+(i%3);
      ctx.strokeStyle=rgba(col.light,(0.12+0.55*p)*(0.5+0.5*Math.sin(i+time*4)**2));
      ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(sx-len,sy);ctx.lineTo(sx+len,sy);ctx.stroke();
    }
    const core=ctx.createRadialGradient(x,y,0,x,y,r*.78);
    core.addColorStop(0,rgba(col.light,0.11+0.52*p));
    core.addColorStop(.45,rgba(col.bright,.18*p));
    core.addColorStop(1,rgba(col.bright,0));
    ctx.fillStyle=core;ctx.beginPath();ctx.arc(x,y,r*.78,0,TAU);ctx.fill();
    ctx.restore();
  }

  // Осколки души и дым после удара; scarlet = мягкий алый взрыв Пробития.
  absorptionBurst(ctx,x,y,r,remaining,time,mode='blood',seed=0) {
    const col=palettes[mode]||palettes.blood;
    const left=clamp(remaining),p=1-left;
    const wave=r*(0.62+1.1*sm(p));
    ctx.save();
    this.haze(ctx,x,y,r*(1.5+1.4*p),col,left*.94);
    ctx.globalCompositeOperation='lighter';
    const ring=ctx.createRadialGradient(x,y,Math.max(0,wave-r*.18),x,y,wave+r*.32);
    ring.addColorStop(0,rgba(col.edge,0));
    ring.addColorStop(.38,rgba(col.bright,.24*left));
    ring.addColorStop(.65,rgba(col.light,.52*left));
    ring.addColorStop(1,rgba(col.bright,0));
    ctx.fillStyle=ring;ctx.beginPath();ctx.arc(x,y,wave+r*.34,0,TAU);ctx.fill();
    ctx.lineWidth=(mode==='scarlet'?2.4:1.5)*left;
    ctx.strokeStyle=rgba(col.bright,0.64*left);
    ctx.beginPath();ctx.ellipse(x,y,wave,wave*.63,time*.42,0,TAU);ctx.stroke();
    this.ribbons(ctx,x,y,r*(.7+.7*p),time+seed*.3,left*.75,col,false);
    for(let i=0;i<13;i++){
      const a=i*2.399+seed*.33;
      const rr=r*(.25+1.3*p)*(0.7+.3*Math.sin(i*8)**2);
      const xx=x+Math.cos(a)*rr, yy=y+Math.sin(a)*rr*.7;
      const d=(1.5+(i%3)*1.1)*left;
      ctx.fillStyle=rgba(i%3?col.bright:col.light,left*.58);
      ctx.beginPath();ctx.moveTo(xx,yy-d*1.7);ctx.lineTo(xx+d*.65,yy);
      ctx.lineTo(xx,yy+d*1.7);ctx.lineTo(xx-d*.65,yy);ctx.closePath();ctx.fill();
    }
    ctx.restore();
  }

  // Лазер в палитре Поглощения, поверх базового игрового лазера.
  absorptionLaser(ctx,x0,y0,x1,y1,width,fade,time) {
    const dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy)||1;
    const nx=-dy/len,ny=dx/len,w=Math.max(1.1,width);
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    for(const [a,thick,color] of [[.14,7,'92,30,104'],[.36,3.4,'171,65,132'],[.81,1.25,'234,139,195'],[.94,.46,'255,220,222']]){
      ctx.strokeStyle=rgba(color,a*fade);ctx.lineWidth=w*thick;
      ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
    }
    for(let j=0;j<2;j++){
      const sign=j?1:-1;
      ctx.beginPath();
      for(let k=0;k<=16;k++){
        const p=k/16;
        const ripple=Math.sin(p*16-time*8+j*3)*w*1.7*Math.sin(Math.PI*p);
        const q=sign*ripple;
        if(!k)ctx.moveTo(x0,y0);
        else ctx.lineTo(x0+dx*p+nx*q,y0+dy*p+ny*q);
      }
      ctx.strokeStyle=rgba(j?'123,50,165':'206,74,131',fade*.32);
      ctx.lineWidth=w*(j?.9:1.5);ctx.stroke();
    }
    this.haze(ctx,x1,y1,w*10,palettes.blood,fade);
    ctx.restore();
  }

  // Эфирный меч: рисуем форму в маленьком кеше один раз, в игре только drawImage.
  makeSword() {
    if(this.sword)return this.sword;
    const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(48,104):
      (typeof document!=='undefined'?document.createElement('canvas'):null);
    if(!canvas)return null;
    canvas.width=48;canvas.height=104;
    const c=canvas.getContext('2d');
    const halo=c.createRadialGradient(24,53,1,24,53,37);
    halo.addColorStop(0,'rgba(185,199,255,0.36)');
    halo.addColorStop(1,'rgba(122,104,240,0)');
    c.fillStyle=halo;c.fillRect(0,0,48,104);
    c.save();c.shadowColor='#a7afff';c.shadowBlur=12;
    const blade=c.createLinearGradient(17,32,31,32);
    blade.addColorStop(0,'#786cc5');blade.addColorStop(.5,'#f0f2ff');blade.addColorStop(1,'#9381ea');
    c.fillStyle=blade;c.beginPath();c.moveTo(24,85);c.lineTo(18.6,34);
    c.lineTo(24,23);c.lineTo(29.4,34);c.closePath();c.fill();
    c.strokeStyle='#e6e3ff';c.lineWidth=1.2;c.stroke();
    c.strokeStyle='#bfb3ff';c.lineWidth=3.5;c.lineCap='round';
    c.beginPath();c.moveTo(15,32);c.quadraticCurveTo(24,39,33,32);c.stroke();
    c.strokeStyle='#dcd6ff';c.lineWidth=2;c.beginPath();c.moveTo(24,30);c.lineTo(24,17);c.stroke();
    c.fillStyle='#e7d9ff';c.beginPath();c.arc(24,14,2,0,TAU);c.fill();
    c.restore();this.sword=canvas;return canvas;
  }

  rainSword(ctx,x,y,scale,time,alpha=1) {
    const sword=this.makeSword();if(!sword)return;
    const w=31*scale,h=67*scale;
    ctx.save();ctx.globalCompositeOperation='lighter';
    const tail=ctx.createLinearGradient(x,y-h*.7,x,y+h*.7);
    tail.addColorStop(0,'rgba(141,122,255,0)');
    tail.addColorStop(.65,rgba('139,130,255',alpha*.17));
    tail.addColorStop(1,rgba('210,208,255',alpha*.32));
    ctx.strokeStyle=tail;ctx.lineWidth=Math.max(1,2*scale);
    ctx.beginPath();ctx.moveTo(x+2*scale,y-h*.95);ctx.lineTo(x,y+h*.25);ctx.stroke();
    ctx.globalAlpha=alpha*(.82+.18*Math.sin(time*6+x*.2)**2);
    ctx.translate(x,y);ctx.rotate(-.075+Math.sin(time*2+x*.03)*.026);
    ctx.drawImage(sword,-w*.5,-h*.5,w,h);ctx.restore();
  }

  // Снаряд+Гравитация: движущаяся линза с преломлёнными орбитами,
  // зажатые волны расширяются в момент освобождения от притяжения.
  gravityLens(ctx,x,y,r,phase,time,velX=0,velY=0) {
    const p=clamp(phase),R=r*(2.6+1.8*sm(p));
    const col={bright:'191,170,255',edge:'111,91,211',smoke:'41,37,111',light:'228,225,255'};
    ctx.save();
    this.haze(ctx,x,y,R*1.45,col,.7);
    ctx.globalCompositeOperation='lighter';
    const spin=time*(.45+1.5*p);
    for(let i=0;i<4;i++){
      const ang=spin*(i%2? -1:1)+i*.82;
      const rx=R*(.55+i*.16),ry=rx*(.31+i*.045);
      ctx.beginPath();ctx.ellipse(x,y,rx,ry,ang,ang*.2,ang*.2+Math.PI*(.95+i*.09));
      ctx.lineWidth=i%2?.8:1.35;
      ctx.strokeStyle=rgba(i%2?col.light:col.bright,(.34+i*.08)*(1-.22*p));
      ctx.stroke();
    }
    for(let j=0;j<3;j++){
      const a=spin*1.7+j*TAU/3;
      const rad=R*(.76+.07*Math.sin(time*5+j));
      const px=x+Math.cos(a)*rad,py=y+Math.sin(a)*rad*.52;
      ctx.fillStyle=rgba(col.light,.55);
      ctx.beginPath();ctx.arc(px,py,.9+j*.25,0,TAU);ctx.fill();
    }
    if(p>.7){
      const v=Math.hypot(velX,velY)||1;
      ctx.strokeStyle=rgba('204,187,255',(.1+.65*(p-.7)/.3));
      ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(x-velX/v*R*2.1,y-velY/v*R*2.1);ctx.lineTo(x,y);ctx.stroke();
    }
    ctx.restore();
  }
}
