// Окно «Enter your name»: при первом входе и после обнуления прогресса. Имя хранится в достижениях (inv.achievements.playerName),
// поэтому уезжает вместе с кодом сохранения и стирается вместе с прогрессом. Имя показывается над магом в инвентаре.
export const NAME_KEY = 'playerName';
export const NAME_MAX = 14;

/** Привести введённое имя к виду для хранения: без лишних пробелов и длиннее NAME_MAX не бывает. Пустое -> ''. */
export function cleanName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}

export class NamePrompt {
  /** root: рамка игры; onDone(имя): имя принято; onOpen/onClose: игру ставят на паузу и снимают */
  constructor(root, { onDone, onOpen, onClose } = {}) {
    this.onDone = onDone || (() => {});
    this.onOpen = onOpen || (() => {});
    this.onClose = onClose || (() => {});
    this.open = false;
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    this.root = mk('div');
    this.root.id = 'name-prompt';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Enter your name');
    const box = mk('div', 'np-box');
    this.input = mk('input', 'np-input');
    this.input.type = 'text';
    this.input.maxLength = NAME_MAX;
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.placeholder = 'Your name';
    this.input.setAttribute('aria-label', 'Your name');
    this.btn = mk('button', 'np-ok', 'OK');
    this.btn.type = 'button';
    this.btn.disabled = true;
    box.append(mk('div', 'np-title', 'Enter your name'), this.input, this.btn);
    this.root.append(box);
    root.append(this.root);
    this.input.addEventListener('input', () => { this.btn.disabled = !cleanName(this.input.value); });
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submit(); });
    this.btn.addEventListener('click', () => this.submit());
  }

  show() {
    if (this.open) return;
    this.open = true;
    this.onOpen();
    this.input.value = '';
    this.btn.disabled = true;
    this.root.classList.add('on');
    setTimeout(() => this.input.focus(), 50);
  }

  submit() {
    const name = cleanName(this.input.value);
    if (!this.open || !name) return;
    this.open = false;
    this.root.classList.remove('on');
    this.input.blur();
    this.onDone(name);
    this.onClose();
  }
}
