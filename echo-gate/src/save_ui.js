// Portable prototype saves: generate a full offline save code, copy it and restore on another device.
function make(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class SaveUi {
  constructor(parent, inventory) {
    this.inventory = inventory;
    this.open = false;
    this.root = make('div', 'gone');
    this.root.id = 'save-panel';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Save and restore progress');

    const sheet = make('div', 'save-sheet');
    const top = make('div', 'save-top');
    const title = make('h2', '', 'SOUL MEMORY');
    this.closeBtn = make('button', 'save-close', '×');
    this.closeBtn.type = 'button';
    this.closeBtn.setAttribute('aria-label', 'Close saves');
    top.append(title, this.closeBtn);

    const intro = make('p', 'save-intro',
      'Your souls, items, sharpening and equipment save automatically on this device. Runs are not saved.');
    const exportTitle = make('div', 'save-label', 'EXPORT PROGRESS');
    this.generateBtn = make('button', 'save-primary', 'GENERATE SAVE CODE');
    this.generateBtn.type = 'button';
    this.output = make('textarea', 'save-code');
    this.output.readOnly = true;
    this.output.rows = 3;
    this.output.spellcheck = false;
    this.output.placeholder = 'Generate a code to move your progress to another device';
    this.output.setAttribute('aria-label', 'Generated save code');
    this.copyBtn = make('button', 'save-secondary', 'COPY CODE');
    this.copyBtn.type = 'button';
    this.copyBtn.disabled = true;

    const importTitle = make('div', 'save-label', 'IMPORT PROGRESS');
    this.input = make('textarea', 'save-code');
    this.input.rows = 3;
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    this.input.autocapitalize = 'off';
    this.input.placeholder = 'Paste a save code from another device';
    this.input.setAttribute('aria-label', 'Paste save code');
    this.loadBtn = make('button', 'save-primary', 'LOAD SAVE CODE');
    this.loadBtn.type = 'button';
    const warning = make('p', 'save-warning',
      'Loading a code replaces this device’s existing progress. Export your current save first.');
    this.status = make('div', 'save-status');
    this.status.setAttribute('role', 'status');

    sheet.append(top, intro, exportTitle, this.generateBtn, this.output, this.copyBtn,
      importTitle, this.input, this.loadBtn, warning, this.status);
    this.root.append(sheet);
    parent.append(this.root);

    this.closeBtn.addEventListener('click', () => this.hide());
    this.generateBtn.addEventListener('click', () => this.generate());
    this.copyBtn.addEventListener('click', () => this.copy());
    this.loadBtn.addEventListener('click', () => this.load());
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    window.addEventListener('keydown', (e) => {
      if (this.open && e.key === 'Escape') this.hide();
    });
  }

  report(message, ok = true) {
    this.status.textContent = message;
    this.status.classList.toggle('error', !ok);
  }

  show() {
    if (this.open) return;
    this.open = true;
    this.output.value = '';
    this.copyBtn.disabled = true;
    this.report('');
    this.root.classList.remove('gone');
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.add('gone');
  }

  generate() {
    if (!this.open) return;
    this.output.value = this.inventory.exportSaveCode();
    this.copyBtn.disabled = false;
    this.report('Code generated. Copy it and keep it safe.');
  }

  async copy() {
    if (!this.open || !this.output.value) return;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(this.output.value);
        copied = true;
      }
    } catch (_) { /* clipboard permissions may be blocked */ }
    if (!copied) {
      this.output.focus();
      this.output.select();
      try { copied = document.execCommand('copy'); } catch (_) { /* select text manually */ }
    }
    this.report(copied ? 'Code copied to clipboard.' : 'Select the code above and copy it manually.', copied);
  }

  load() {
    if (!this.open) return;
    try {
      this.inventory.importSaveCode(this.input.value);
      this.output.value = '';
      this.copyBtn.disabled = true;
      this.report('Progress restored: ' + this.inventory.souls.toLocaleString('en-US') + ' souls and '
        + this.inventory.count + ' items. Your game has been saved.');
      this.input.value = '';
    } catch (error) {
      this.report(error.message || 'Unable to restore this code.', false);
    }
  }
}
