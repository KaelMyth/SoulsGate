// Чёрное солнце: самостоятельный рендер тройной магии без игровых вычислений.
// Дымные спирали и прозрачные градиенты, без твёрдых геометрических обводок.
const TAU=Math.PI*2;
const clamp=v=>Math.max(0,Math.min(1,v));
const rgb=(r,g,b,a)=>'rgba('+r+','+g+','+b+','+clamp(a)+')';

export class BlackSunFx {
  constructor(renderer){this.r=renderer;}

  drawBack(ctx,hx,hy) {
    const sun=this.r.blackSun;
    if(!sun?.enabled)return;
    const t=this.r.clock,R=this.r.aura.radius;
    const charging=sun.phase==='collapse';
    const u=charging?clamp(sun.time/Math.max(.01,this.r.cfg.blackSun.collapseTime)):0;
    ctx.save();
    ctx.translate(hx,hy);
    // Поле наследует обычную ослабленную Гравитацию с Аурой; добавляем только свой слой.
    const mist=ctx.createRadialGradient(0,0,R*.1,0,0,R*1.1);
    mist.addColorStop(0,rgb(13,8,31,.11+(charging?.17*u:0)));
    mist.addColorStop(.52,rgb(60,28,105,.075));
    mist.addColorStop(.79,rgb(105,50,163,.11));
    mist.addColorStop(1,rgb(35,18,76,0));
    ctx.fillStyle=mist;
    ctx.beginPath();ctx.arc(0,0,R*1.1,0,TAU);ctx.fill();
    ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    // Широкие, неодинаковые дымные ленты; спирали плывут в противоположные стороны.
    for(let i=0;i<9;i++){
      const a0=i*2.399+t*(i%2?-.26:.31);
      const drift=Math.sin(t*1.2+i*1.91)*.09;
      const scale=charging?1-.79*u:1;
      for(let pass=0;pass<2;pass++){
        ctx.strokeStyle=pass?'#b17bdf':'#3d245e';
        ctx.lineWidth=(pass?3.2:16)*(1-(charging?.48*u:0));
        ctx.globalAlpha=(pass?.16:.23)*(charging?1+u:1);
        ctx.beginPath();
        for(let k=0;k<=13;k++){
          const v=k/13;
          const rad=R*(.14+.8*v)*scale*(1+.05*Math.sin(t*2.1+i+k*.65));
          const ang=a0+(i%2?-1:1)*(v*1.75+drift);
          const x=Math.cos(ang)*rad,y=Math.sin(ang)*rad*.84;
          if(!k)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.stroke();
      }
    }
    if(charging) {
      for(let i=0;i<7;i++){
        const a=i*TAU/7+t*.55;
        const r0=R*(1-u*.87);
        ctx.strokeStyle='#caa0ff';
        ctx.globalAlpha=.38*u;
        ctx.lineWidth=8*(1-u)+2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a)*r0,Math.sin(a)*r0);
        ctx.quadraticCurveTo(Math.cos(a+.4)*r0*.6,Math.sin(a+.4)*r0*.6,
          Math.cos(a+.9)*r0*.17,Math.sin(a+.9)*r0*.17);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawFront(ctx,hx,hy) {
    const sun=this.r.blackSun;
    if(!sun?.enabled)return;
    const B=this.r.cfg.blackSun,t=this.r.clock;
    if(sun.phase==='burst')this.drawBurst(ctx,sun,t);
    if(sun.phase==='soul' && sun.soul)this.drawSoul(ctx,sun.soul,clamp(sun.time/Math.max(.01,B.soulTime)),t);
    const cx=hx,cy=hy-this.r.hero.radius*2.6;
    const collapsing=sun.phase==='collapse';
    const u=collapsing?clamp(sun.time/Math.max(.01,B.collapseTime)):0;
    const core=this.r.hero.radius*(1.45+(sun.phase==='soul'?.22*Math.sin(t*14):0))*(collapsing?1-.82*u:1);
    ctx.save();
    ctx.translate(cx,cy);
    ctx.globalCompositeOperation='lighter';
    const halo=ctx.createRadialGradient(0,0,core*.3,0,0,core*4.4);
    halo.addColorStop(0,rgb(175,104,246,.58));
    halo.addColorStop(.21,rgb(133,58,233,.4));
    halo.addColorStop(.56,rgb(100,42,191,.14));
    halo.addColorStop(1,rgb(63,25,109,0));
    ctx.globalAlpha=.83+(collapsing?.17*u:0);
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,core*4.4,0,TAU);ctx.fill();
    // Плазменная корона, без идеальных колец: 12 вращающихся разлохмаченных языков.
    for(let i=0;i<12;i++){
      const angle=i*TAU/12+t*(i%2?-.53:.48);
      const spike=core*(1.7+.5*Math.sin(t*2.9+i*2.1));
      const w=core*(.28+.08*Math.sin(t*2+i));
      const x=Math.cos(angle),y=Math.sin(angle);
      ctx.globalAlpha=.16+.13*(1+Math.sin(t*3+i));
      ctx.fillStyle=i%3?'#9352d8':'#d59dff';
      ctx.beginPath();
      ctx.moveTo(-y*w+x*core*.72,y*core*.72+x*w);
      ctx.quadraticCurveTo(x*spike-y*w*.65,y*spike+x*w*.65,x*core*.8+y*w,y*core*.8-x*w);
      ctx.closePath();ctx.fill();
    }
    // Тёмный диск не светится насквозь, его обволакивает корона и линзирующая дымка.
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    const disk=ctx.createRadialGradient(-core*.23,-core*.24,0,0,0,core*1.25);
    disk.addColorStop(0,'#040512');disk.addColorStop(.53,'#080818');
    disk.addColorStop(.79,'#190e30');
    disk.addColorStop(1,rgb(48,21,80,0));
    ctx.fillStyle=disk;ctx.beginPath();ctx.arc(0,0,core*1.25,0,TAU);ctx.fill();
    ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    for(let i=0;i<5;i++){
      const a=t*(i%2?.9:-.72)+i*TAU/5;
      ctx.globalAlpha=.27+.15*Math.sin(t*2+i);
      ctx.strokeStyle=i%2?'#cf94ef':'#9765f6';
      ctx.lineWidth=2.2;
      ctx.beginPath();
      ctx.arc(0,0,core*(1.17+.1*Math.sin(t+i)),a,a+1.2);
      ctx.stroke();
    }
    if(collapsing) {
      // Короткая сверхъяркая точка в конце имплозии, затем большой удар.
      ctx.globalAlpha=.65*u*u;
      ctx.fillStyle='#f3dcff';
      ctx.beginPath();ctx.arc(0,0,2+3*u,0,TAU);ctx.fill();
    }
    ctx.restore();
  }

  drawSoul(ctx,soul,u,t) {
    const fade=(1-u)*(1-u);
    if(fade<=0)return;
    const radius=Math.max(9,soul.radius*1.35)*(1+.75*u);
    const glow=this.r.getGlow(true);
    ctx.save();ctx.translate(soul.x,soul.y);
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.7*fade;
    ctx.drawImage(glow,-radius,-radius,radius*2,radius*2);
    for(let i=0;i<10;i++){
      const a=i*2.4+t*(i%2?-.55:.64)+soul.seed;
      const d=radius*(.2+1.4*u)*(1+.13*Math.sin(t*3+i));
      const x=Math.cos(a)*d,y=Math.sin(a)*d*.82-u*8;
      const s=3+3*fade+(i%3);
      ctx.globalAlpha=fade*(.3+.28*(i%3)/3);
      ctx.drawImage(glow,x-s,y-s,2*s,2*s);
      ctx.strokeStyle=i%2?'#9e65c9':'#d9b4ff';ctx.lineWidth=2.2*fade+.6;
      ctx.beginPath();ctx.moveTo(x,y);
      ctx.quadraticCurveTo(x+Math.sin(a)*7,y-6-u*9,x+Math.sin(t+i)*3,y-14-u*15);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBurst(ctx,sun,t) {
    const p=clamp(sun.time/Math.max(.01,this.r.cfg.blackSun.burstTime));
    const R=sun.burstRadius;
    const wave=R*(.06+.94*(1-(1-p)**2));
    ctx.save();ctx.translate(sun.burstX,sun.burstY);
    ctx.lineCap='round';
    // Имплозия даёт не огонь, а прохладную пространственную ударную волну.
    const gr=ctx.createRadialGradient(0,0,wave*.35,0,0,wave*1.1);
    gr.addColorStop(0,rgb(20,11,43,0));
    gr.addColorStop(.57,rgb(43,23,81,.13*(1-p)));
    gr.addColorStop(.89,rgb(143,91,213,.23*(1-p)));
    gr.addColorStop(1,rgb(187,133,236,0));
    ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,0,wave*1.1,0,TAU);ctx.fill();
    ctx.globalCompositeOperation='lighter';
    for(let j=0;j<2;j++){
      ctx.lineWidth=(j?3:14)*(1-p)+1;
      ctx.strokeStyle=j?'#e1b9ff':'#8558c0';
      ctx.globalAlpha=(j?.57:.17)*(1-p);
      ctx.beginPath();
      for(let i=0;i<=56;i++){
        const a=i*TAU/56;
        const wob=1+.024*Math.sin(a*13+t*16)+.025*Math.sin(a*7-t*9);
        const rr=wave*wob;
        if(i===0)ctx.moveTo(rr,0);
        else ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);
      }
      ctx.closePath();ctx.stroke();
    }
    // Остатки поля расходятся клочьями, затем полностью растворяются.
    const glow=this.r.getGlow(true);
    for(let i=0;i<12;i++){
      const a=i*2.399+Math.sin(t*4+i)*.14;
      const d=wave*(.64+.26*(i%3)/2);
      const x=Math.cos(a)*d,y=Math.sin(a)*d;
      const sz=13+17*p;
      ctx.globalAlpha=(1-p)*(.24+.08*(i%4));
      ctx.drawImage(glow,x-sz,y-sz,sz*2,sz*2);
    }
    ctx.restore();
  }
}
