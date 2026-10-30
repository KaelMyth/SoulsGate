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
// Более насыщенная палитра оболочки, независимая от уже настроенного лазера.
const orbPalettes = {
  blood: {bright:'255,111,216',edge:'176,54,191',smoke:'81,27,119',light:'255,223,253'},
  phantom: {bright:'216,151,255',edge:'134,68,249',smoke:'66,35,146',light:'249,228,255'}
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

  // У Поглощения один источник — земля ПОД мобом. Это не парящий круг:
  // мягкий разлом в почве, клубы тумана и поднимающиеся из разлома потоки.
  absorptionGround(ctx,x,y,r,progress,time,col,alpha=1) {
    const p=sm(clamp(progress));
    const groundY=y+r*.42;
    const radius=r*(1.03+.36*p);
    ctx.save();
    ctx.globalCompositeOperation='source-over';
    // Непрозрачный тёмный центр и очень мягкая внешняя граница.
    const well=ctx.createRadialGradient(x,groundY,0,x,groundY,radius*1.6);
    well.addColorStop(0,rgba('20,8,26',.71*alpha));
    well.addColorStop(.32,rgba(col.smoke,.62*alpha));
    well.addColorStop(.66,rgba(col.edge,.22*alpha));
    well.addColorStop(1,rgba(col.smoke,0));
    ctx.fillStyle=well;
    ctx.beginPath();ctx.ellipse(x,groundY,radius*1.56,radius*.69,0,0,TAU);ctx.fill();
    // Не геометрические кольца, а отдельные мягкие пятна разрыва земли.
    for(let i=0;i<7;i++){
      const ang=i*2.399+time*.13;
      const rr=radius*(.34+.49*(i%3)/2);
      const bx=x+Math.cos(ang)*rr, by=groundY+Math.sin(ang)*rr*.33;
      const size=radius*(.33+.11*(i%3));
      const g=ctx.createRadialGradient(bx,by,0,bx,by,size);
      g.addColorStop(0,rgba(i%3?col.smoke:col.edge,(.19+.12*p)*alpha));
      g.addColorStop(1,rgba(col.smoke,0));
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(bx,by,size,0,TAU);ctx.fill();
    }
    ctx.restore();
  }

  // Дым идёт вверх из того же наземного разлома и обнимает нижнюю часть врага.
  // Время и seed дают плавное движение, без случайного подёргивания кадров.
  absorptionMist(ctx,x,y,r,progress,time,col,alpha=1,seed=0) {
    const p=clamp(progress);
    const groundY=y+r*.43;
    ctx.save();ctx.globalCompositeOperation='source-over';
    for(let i=0;i<10;i++){
      const drift=((time*(.24+i%3*.045)+i/10+seed*.071)%1+1)%1;
      const angle=i*2.399+seed*.37;
      const wander=Math.sin(angle+time*(.68+i%3*.15)+drift*3.8);
      const sx=x+Math.cos(angle)*r*(.38+.42*(i%4)/3);
      const sy=groundY+Math.sin(angle)*r*.17;
      const xx=sx*(1-drift)+ (x+wander*r*.48)*drift;
      const yy=sy-drift*r*(1.35+.48*p);
      const size=r*(.22+.21*drift+(.08*(i%3)));
      const a=alpha*(.13+.15*p)*Math.sin(Math.PI*drift);
      const g=ctx.createRadialGradient(xx,yy,0,xx,yy,size);
      g.addColorStop(0,rgba(i%3===0?col.bright:col.edge,a*.8));
      g.addColorStop(.48,rgba(col.smoke,a));
      g.addColorStop(1,rgba(col.smoke,0));
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(xx,yy,size,0,TAU);ctx.fill();
    }
    ctx.restore();
  }

  // Полупрозрачные дымные языки: отдельный верхний слой поверх спрайта моба.
  // Каждый язык вырастает от нижнего края модели, а не висит в воздухе.
  absorptionVeil(ctx,x,y,r,progress,time,mode='blood',seed=0) {
    const col=palettes[mode]||palettes.blood,p=sm(clamp(progress));
    const groundY=y+r*.43;
    ctx.save();ctx.globalCompositeOperation='lighter';
    for(let i=0;i<6;i++){
      const side=i%2?-1:1;
      const u=i/5,anchor=x+side*r*(.42+.27*u);
      const tipX=x+Math.sin(time*(1.13+u*.45)+i*1.91+seed*.2)*r*(.17+.17*u);
      const tipY=y-r*(.1+.68*p+(.21*(i%3)));
      const lift=Math.max(.12,p);
      const g=ctx.createLinearGradient(anchor,groundY,tipX,tipY);
      g.addColorStop(0,rgba(col.smoke,0));
      g.addColorStop(.28,rgba(col.edge,(.10+.15*lift)));
      g.addColorStop(.7,rgba(i%3===0?col.bright:col.edge,(.09+.15*lift)));
      g.addColorStop(1,rgba(col.bright,0));
      const bend=side*r*(.21+.16*Math.sin(time*1.7+i));
      const baseWidth=r*(.11+.045*(i%3));
      // Вытянутый дымный лепесток; края растворяются, нет ровных контуров.
      ctx.fillStyle=g;
      ctx.beginPath();
      ctx.moveTo(anchor-baseWidth,groundY);
      ctx.bezierCurveTo(anchor+bend,groundY-r*.38,tipX-bend*.5,tipY+r*.43,tipX,tipY);
      ctx.bezierCurveTo(tipX+bend*.35,tipY+r*.34,anchor+baseWidth,groundY-r*.24,
        anchor+baseWidth,groundY);
      ctx.closePath();ctx.fill();
    }
    ctx.restore();
  }

  // Каст сначала открывает разлом ПОД целью, затем поднимается дым; свет в
  // конце собирается снизу в точку удара, без парящих орбитальных колец.
  absorptionCharge(ctx,x,y,r,progress,time,mode='blood',seed=0) {
    const col=palettes[mode]||palettes.blood;
    const p=sm(clamp(progress));
    ctx.save();
    this.absorptionGround(ctx,x,y,r,p,time,col,.75+.25*p);
    this.absorptionMist(ctx,x,y,r,p,time,col,.84,seed);
    // Сдержанный свет из щели под врагом, нарастает к финалу.
    const baseY=y+r*.34;
    const gr=ctx.createRadialGradient(x,baseY,0,x,baseY,r*(.78+.20*p));
    gr.addColorStop(0,rgba(col.bright,(.08+.26*p)));
    gr.addColorStop(.42,rgba(col.edge,.11*p));
    gr.addColorStop(1,rgba(col.smoke,0));
    ctx.fillStyle=gr;ctx.beginPath();ctx.ellipse(x,baseY,r*(.86+.24*p),r*.39,0,0,TAU);ctx.fill();
    ctx.restore();
  }

  // Удар тоже возникает снизу: наземная воронка схлопывается, дым
  // поднимается и растворяется. Пробитие сохраняет мягкий АЛЫЙ всплеск.
  absorptionBurst(ctx,x,y,r,remaining,time,mode='blood',seed=0) {
    const col=palettes[mode]||palettes.blood;
    const left=clamp(remaining),p=1-left;
    const radius=r*(.8+1.18*sm(p));
    const groundY=y+r*.4;
    ctx.save();
    this.absorptionGround(ctx,x,y,r*(1+.65*p),p,time,col,left*.78);
    this.absorptionMist(ctx,x,y,r*(.92+.32*p),p,time,col,left*.84,seed+11);
    const flash=ctx.createRadialGradient(x,groundY,0,x,groundY,radius);
    flash.addColorStop(0,rgba(mode==='scarlet'?'255,186,163':col.light,mode==='scarlet'?.51*left:.32*left));
    flash.addColorStop(.25,rgba(col.bright,.35*left));
    flash.addColorStop(.6,rgba(col.edge,.19*left));
    flash.addColorStop(1,rgba(col.smoke,0));
    ctx.globalCompositeOperation='lighter';
    ctx.fillStyle=flash;
    ctx.beginPath();ctx.ellipse(x,groundY,radius,radius*.51,0,0,TAU);ctx.fill();
    // Алый вариант: рассеянные мягкие волны, а не очерченный круг.
    if(mode==='scarlet') {
      for(let i=0;i<9;i++){
        const a=i*2.399+seed*.3;
        const d=radius*(.3+.57*Math.sin(i*6.8)**2);
        const px=x+Math.cos(a)*d,py=groundY+Math.sin(a)*d*.48;
        const g=ctx.createRadialGradient(px,py,0,px,py,r*.32);
        g.addColorStop(0,rgba(col.bright,.31*left));
        g.addColorStop(1,rgba(col.edge,0));
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(px,py,r*.32,0,TAU);ctx.fill();
      }
    }
    ctx.restore();
  }

  // Лазер+Поглощение — не геометрический луч, а объёмный живой поток.
  // Цель/урон определяет игровая логика, здесь только мягкое колышущееся
  // свечение, четыре дымные ленты и движущиеся сгустки энергии.
  absorptionLaser(ctx,x0,y0,x1,y1,width,fade,time) {
    const dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy)||1;
    const nx=-dy/len,ny=dx/len,w=Math.max(1.5,width),f=clamp(fade);
    if(f<=0)return;
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';ctx.lineJoin='round';
    // Боковые нити не рисуются прямыми и не имеют яркого белого контура.
    const flow=(strand,layer)=>{
      const j=strand-1.5;
      const amp=w*(1.75+Math.abs(j)*1.0);
      ctx.beginPath();
      for(let k=0;k<=24;k++){
        const u=k/24,env=Math.sin(Math.PI*u);
        const drift=Math.sin(u*10-time*(2.0+strand*.19)+strand*1.7)*amp*.6
          +Math.sin(u*19+time*1.3+strand*2.1)*amp*.28;
        const off=env*(drift+j*w*.72);
        const xx=x0+dx*u+nx*off, yy=y0+dy*u+ny*off;
        if(!k)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
      }
      ctx.strokeStyle=rgba(layer===0?'90,30,93':layer===1?'155,60,128':'223,129,182',
        f*(layer===0?.085:layer===1?.19:.22));
      ctx.lineWidth=w*(layer===0?8:layer===1?4:1.4)/(1+.26*Math.abs(j));
      ctx.stroke();
    };
    for(let strand=0;strand<4;strand++)
      for(let layer=0;layer<3;layer++)flow(strand,layer);
    // Непостоянные мягкие сгустки плывут по потоку к цели.
    for(let i=0;i<11;i++){
      const u=((time*(.36+.025*(i%3))+i/11)%1+1)%1;
      const off=Math.sin(u*14-time*2+i*2.1)*w*(1.4+u*.9)*Math.sin(Math.PI*u);
      const x=x0+dx*u+nx*off,y=y0+dy*u+ny*off;
      const rad=w*(1.65+(.8*Math.sin(time+i)**2));
      const g=ctx.createRadialGradient(x,y,0,x,y,rad);
      g.addColorStop(0,rgba(i%3===0?'221,149,202':'151,64,143',f*.2));
      g.addColorStop(.6,rgba('105,39,115',f*.1));
      g.addColorStop(1,rgba('76,27,81',0));
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,rad,0,TAU);ctx.fill();
    }
    this.haze(ctx,x1,y1,w*9,palettes.blood,f*.58);
    ctx.restore();
  }

  // #156: кэшированные облака с неоднородными краями вместо гладких
  // окружностей. Рисуем их множеством мягких облачных сгустков: сзади,
  // затем поверх моба, чтобы дым действительно постепенно его укрывал.
  smokeTexture(mode='blood',bright=false) {
    if(!this.smokeCache)this.smokeCache=Object.create(null);
    const key=mode+(bright?'-lit':'-dark');
    if(this.smokeCache[key])return this.smokeCache[key];
    const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(128,128):
      (typeof document!=='undefined'?document.createElement('canvas'):null);
    if(!canvas)return null;
    canvas.width=canvas.height=128;
    const g=canvas.getContext('2d');
    if(!g)return null;
    const col=orbPalettes[mode]||orbPalettes.blood;
    // Смещённые перекрывающиеся дольки с разной прозрачностью.
    // Прозрачность всегда уходит в ноль на границах спрайта.
    for(let j=0;j<7;j++){
      const angle=j*2.399;
      const cx=64+Math.cos(angle)*(j%2?15:10);
      const cy=64+Math.sin(angle)*(j%3?12:17);
      const r=34+(j%3)*7;
      const grad=g.createRadialGradient(cx,cy,2,cx,cy,r);
      const core=bright?(j%3===0?col.light:col.bright):(j%3===0?col.edge:col.smoke);
      const outer=bright?col.edge:col.bright;
      grad.addColorStop(0,rgba(core,bright?.22:.37));
      grad.addColorStop(.33,rgba(core,bright?.18:.31));
      grad.addColorStop(.66,rgba(outer,bright?.10:.15));
      grad.addColorStop(1,rgba(outer,0));
      g.fillStyle=grad;g.beginPath();g.arc(cx,cy,r,0,TAU);g.fill();
    }
    this.smokeCache[key]=canvas;
    return canvas;
  }

  smokeCloud(ctx,x,y,size,opacity,mode='blood',bright=false) {
    const a=clamp(opacity);
    if(a<=0||size<=0)return;
    const tile=this.smokeTexture(mode,bright);
    if(tile){
      ctx.globalAlpha=a;
      ctx.drawImage(tile,x-size,y-size*.82,size*2,size*1.64);
    }else{
      // Без OffscreenCanvas остаётся точно такое же плавное облако.
      const col=orbPalettes[mode]||orbPalettes.blood;
      const grad=ctx.createRadialGradient(x,y,0,x,y,size);
      const tint=bright?col.bright:col.edge;
      grad.addColorStop(0,rgba(tint,a*(bright?.37:.52)));
      grad.addColorStop(.48,rgba(bright?col.light:col.smoke,a*.24));
      grad.addColorStop(1,rgba(col.smoke,0));
      ctx.fillStyle=grad;ctx.beginPath();ctx.arc(x,y,size,0,TAU);ctx.fill();
    }
  }

  // Источник сферы — клубящийся объем вокруг центра противника,
  // а не плоский диск и не ровная обводка.
  absorptionSphereBack(ctx,x,y,r,progress,time,mode='blood',seed=0) {
    const col=orbPalettes[mode]||orbPalettes.blood;
    const p=sm(clamp(progress)),R=Math.max(10,r*1.20);
    const inherited=ctx.globalAlpha;
    ctx.save();ctx.globalCompositeOperation='source-over';
    // Большое насыщенное, но размытое пятно света за мобом.
    const aura=ctx.createRadialGradient(x,y,R*.22,x,y,R*1.95);
    aura.addColorStop(0,rgba(col.bright,.13+.13*p));
    aura.addColorStop(.37,rgba(col.edge,.23+.15*p));
    aura.addColorStop(.73,rgba(col.smoke,.095+.11*p));
    aura.addColorStop(1,rgba(col.smoke,0));
    ctx.fillStyle=aura;ctx.beginPath();ctx.arc(x,y,R*1.95,0,TAU);ctx.fill();

    // Несинхронные дымные клубы облетают моба с разной скоростью.
    for(let i=0;i<21;i++){
      const birth=(i%11)/18;
      const t=sm(clamp((p-birth)*2.5));
      const ang=i*2.399+seed*.27+time*(i%2?-.24:.30);
      const orbit=R*(1.12-.53*t+.10*Math.sin(time*1.3+i));
      const px=x+Math.cos(ang)*orbit;
      const py=y+Math.sin(ang)*orbit*.86;
      const sz=R*(.41+.10*(i%4)+.21*t);
      this.smokeCloud(ctx,px,py,sz,inherited*(.24+.49*t),mode,i%4===0);
    }
    ctx.restore();
  }

  // Сгустки возникают по краям и сходятся к середине; каждый имеет
  // собственную фазу, поэтому оболочка выглядит живым дымом, а не шариком.
  absorptionSphereFront(ctx,x,y,r,progress,time,mode='blood',seed=0) {
    const col=orbPalettes[mode]||orbPalettes.blood;
    const p=sm(clamp(progress)),R=Math.max(10,r*1.20);
    const inherited=ctx.globalAlpha;
    ctx.save();ctx.globalCompositeOperation='source-over';
    // На раннем этапе враг виден между клубами, к концу почти скрыт.
    // Каждая группа облаков накрывает другую сторону, без сплошной заливки.
    for(let i=0;i<27;i++){
      const birth=(i%9)*.085;
      const arrive=sm(clamp((p-birth)*2.9));
      if(arrive<.005)continue;
      const side=i%2===0?1:-1;
      const a=i*2.399+seed*.24+time*(.19+(i%3)*.045)*side;
      const orbit=R*(1.17-.98*arrive);
      const wobble=Math.sin(time*1.6+i*2.1)*R*.14;
      const px=x+Math.cos(a)*orbit+Math.cos(a+1.3)*wobble;
      const py=y+Math.sin(a)*orbit*.9+Math.sin(a+.7)*wobble*.68;
      const sz=R*(.37+.11*(i%4)+.29*arrive);
      const alpha=inherited*clamp((.25+.70*arrive)*(.62+.38*p));
      this.smokeCloud(ctx,px,py,sz,alpha,mode,i%5===0);
    }
    // Световые облака под поверхностью дымной оболочки: не линии и не дуги.
    ctx.globalCompositeOperation='lighter';
    for(let j=0;j<6;j++){
      const a=j*TAU/6+seed*.16-time*(j%2?-.27:.32);
      const dist=R*(.83-.27*p);
      const cx=x+Math.cos(a)*dist,cy=y+Math.sin(a)*dist*.83;
      const sz=R*(.28+.08*(j%3));
      this.smokeCloud(ctx,cx,cy,sz,inherited*(.19+.25*p),mode,true);
    }
    // Тусклой плоской сердцевины нет — только мягкий бликующий туман.
    const light=ctx.createRadialGradient(x-R*.22,y-R*.31,0,x,y,R*.98);
    light.addColorStop(0,rgba(col.light,(.045+.18*p)*inherited));
    light.addColorStop(.34,rgba(col.bright,(.05+.16*p)*inherited));
    light.addColorStop(1,rgba(col.smoke,0));
    ctx.fillStyle=light;ctx.beginPath();ctx.arc(x,y,R,0,TAU);ctx.fill();
    ctx.restore();
  }

  // На ударе сгустки сжимаются внутрь и рассеиваются, сохраняя
  // объёмный дымный характер вместо геометрической ударной волны.
  absorptionSphereBurst(ctx,x,y,r,remaining,time,mode='blood',seed=0) {
    const left=clamp(remaining),gone=1-left;
    if(left<=0)return;
    const radius=r*(1.08-.65*sm(gone));
    ctx.save();ctx.globalAlpha*=left;
    this.absorptionSphereBack(ctx,x,y,radius,1,time,mode,seed);
    this.absorptionSphereFront(ctx,x,y,radius,1,time,mode,seed);
    const col=orbPalettes[mode]||orbPalettes.blood;
    const flare=ctx.createRadialGradient(x,y,0,x,y,r*(.72+.18*gone));
    flare.addColorStop(0,rgba(col.light,.53*left));
    flare.addColorStop(.34,rgba(col.bright,.37*left));
    flare.addColorStop(1,rgba(col.edge,0));
    ctx.globalCompositeOperation='lighter';ctx.fillStyle=flare;
    ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
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
