// Soul payout ritual: count animates from 0 to the full multiplied payout.
// Every blue / gold / red modifier gets its own particle burst, halo and count surge.
const format = (n) => Math.round(n).toLocaleString('en-US');
const curve = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class SoulTally {
  constructor(parent) {
    this.root = document.createElement('div');
    this.root.id = 'soul-tally';
    this.root.className = 'gone';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Souls earned');
    this.root.setAttribute('aria-modal', 'true');
    this.root.innerHTML = `
      <div class="st-radiance"></div><div class="st-embers"></div><div class="st-halo"></div>
      <div class="st-content">
        <div class="st-overline">THE DREAM RELEASES ITS SOULS</div>
        <div class="st-sigil" aria-hidden="true">
          <svg viewBox="0 0 100 112"><path d="M50 4C39 27 16 36 16 65c0 25 15 40 34 40s34-15 34-40C84 36 61 27 50 4z" fill="currentColor" opacity=".27"/><path d="M50 19C38 44 30 51 30 69c0 17 9 27 20 27s20-10 20-27C70 51 62 44 50 19z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M50 48c-6 13-12 18-12 27a12 12 0 0 0 24 0c0-9-6-14-12-27z" fill="currentColor" opacity=".75"/></svg>
        </div>
        <div class="st-headline">SOULS HARVESTED</div>
        <div class="st-number" aria-live="off">0</div>
        <div class="st-stage">SOULS GATHERED</div>
        <div class="st-factor">×1</div>
        <div class="st-modifiers" aria-label="Applied soul multipliers"></div>
        <div class="st-ledger"><span>SOUL BALANCE</span><strong>0</strong></div>
        <button class="st-continue" type="button">SKIP ANIMATION</button>
      </div>`;
    this.number = this.root.querySelector('.st-number');
    this.stageLabel = this.root.querySelector('.st-stage');
    this.factor = this.root.querySelector('.st-factor');
    this.ledger = this.root.querySelector('.st-ledger strong');
    this.modifiers = this.root.querySelector('.st-modifiers');
    this.embers = this.root.querySelector('.st-embers');
    this.button = this.root.querySelector('.st-continue');
    this.button.addEventListener('click', () => this.done ? this.close() : this.skip());
    this.open = false;
    this.done = false;
    this.raf = null;
    this.current = null;
    parent.append(this.root);
  }

  show(tally, balanceBefore) {
    this.close();
    this.open = true;
    this.done = false;
    this.tally = tally;
    this.balanceBefore = balanceBefore;
    this.modifiers.replaceChildren();
    this.button.textContent = 'SKIP ANIMATION';
    this.root.classList.remove('gone');
    this.playStage(0);
  }

  draw(n) {
    this.number.textContent = format(n);
    this.ledger.textContent = format(this.balanceBefore + n);
  }

  burst(stage) {
    this.root.dataset.tier = stage.tier;
    this.root.classList.remove('st-burst');
    void this.root.offsetWidth;
    this.root.classList.add('st-burst');
    const count = stage.tier === 'red' ? 56 : stage.tier === 'gold' ? 40 : stage.tier === 'blue' ? 28 : 18;
    const group = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const spark = document.createElement('i');
      const angle = (Math.PI * 2 * i / count) + Math.sin(i * 41) * 0.27;
      const radius = 80 + (i % 7) * (stage.tier === 'red' ? 19 : 11);
      spark.style.setProperty('--dx', `${Math.cos(angle) * radius}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * radius}px`);
      spark.style.setProperty('--delay', `${(i % 6) * 40}ms`);
      spark.style.setProperty('--s', `${(i % 4) + 2}px`);
      group.append(spark);
    }
    this.embers.replaceChildren(group);
  }

  playStage(index) {
    if (!this.open) return;
    this.index = index;
    const stage = this.tally.stages[index];
    if (!stage) { this.finish(); return; }
    this.current = stage;
    this.stageLabel.textContent = stage.label;
    this.factor.textContent = stage.factor === 1 ? 'PURE SOULS' : `×${stage.factor.toFixed(stage.factor === 1.1 || stage.factor === 1.5 ? 1 : 0)}`;
    this.burst(stage);
    this.started = null;
    this.duration = stage.tier === 'base' ? 1100 : stage.tier === 'blue' ? 950 : stage.tier === 'gold' ? 1150 : 1450;
    this.draw(stage.from);
    this.raf = requestAnimationFrame((now) => this.tick(now));
  }

  tick(now) {
    if (!this.open || this.done) return;
    if (this.started === null) this.started = now;
    const elapsed = now - this.started;
    const progress = curve(elapsed / this.duration);
    const { from, to } = this.current;
    this.draw(from + (to - from) * progress);
    if (elapsed < this.duration + 320) {
      this.raf = requestAnimationFrame((n) => this.tick(n));
      return;
    }
    this.draw(to);
    if (this.index > 0) {
      const badge = document.createElement('span');
      badge.className = `st-chip ${this.current.tier}`;
      badge.textContent = `×${this.current.factor}`;
      this.modifiers.append(badge);
    }
    this.playStage(this.index + 1);
  }

  finish() {
    if (!this.open) return;
    this.done = true;
    this.current = null;
    this.root.dataset.tier = this.tally.stages.at(-1)?.tier || 'base';
    this.stageLabel.textContent = 'ALL MULTIPLIERS APPLIED';
    this.factor.textContent = `TOTAL ×${this.tally.multiplier.toFixed(2)}`;
    this.draw(this.tally.total);
    this.button.textContent = 'RETURN TO THE FIRE';
    this.root.classList.add('st-complete');
  }

  skip() {
    if (!this.open || this.done) return;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.modifiers.replaceChildren();
    for (const stage of this.tally.stages.slice(1)) {
      const badge = document.createElement('span');
      badge.className = `st-chip ${stage.tier}`;
      badge.textContent = `×${stage.factor}`;
      this.modifiers.append(badge);
    }
    this.finish();
  }

  close() {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.open = false;
    this.done = false;
    this.root.classList.add('gone');
    this.root.classList.remove('st-complete', 'st-burst');
  }
}
