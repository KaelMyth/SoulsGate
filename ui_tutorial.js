// Короткое обучение: выбор перед началом игры, затем действия на настоящем поле.
// Подсказка не перекрывает стик: движение и блок игрок пробует сам.
import { h } from './ui_dom.js';

const STEPS = [
  {
    title: 'Передвижение',
    text: 'Коснись свободного места на поле и веди пальцем. Появится стик: направляй его, чтобы идти.',
    action: 'Попробуй пройти несколько шагов',
    event: 'move',
  },
  {
    title: 'Блок и парирование',
    text: 'Отпусти стик: герой создаст щит. В первые 0,25 секунды блок парирует попадания. Перед следующим блоком коснись стика снова.',
    action: 'Попробуй отпустить стик и поднять щит',
    event: 'block',
  },
  {
    title: 'Автоматическая атака',
    text: 'Герой сам стреляет в ближайшего врага в радиусе атаки. Двигайся, уклоняйся и усиливай заклинания модами.',
    action: 'Освоено',
    event: null,
  },
];

export class TutorialUI {
  constructor(root, onChoose, onFinish) {
    this.onChoose = onChoose;
    this.onFinish = onFinish;
    this.step = 0;
    this.active = false;

    this.choice = h('div', { id: 'tutorial-choice', hidden: '' },
      h('section', { class: 'tutorial-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Обучение' },
        h('div', { class: 'tutorial-ornament', 'aria-hidden': 'true' }, '✦  ·  ✦'),
        h('h2', {}, 'Желаете пройти обучение?'),
        h('p', {}, 'Передвижение, парирование и автоматическая атака.'),
        h('div', { class: 'tutorial-actions' },
          h('button', { type: 'button', onclick: () => this.answer(true) }, 'Да'),
          h('button', { type: 'button', class: 'secondary', onclick: () => this.answer(false) }, 'Нет'))));
    this.count = h('div', { class: 'tutorial-count' });
    this.title = h('h2', {});
    this.text = h('p', {});
    this.action = h('p', { class: 'tutorial-action' });
    this.nextButton = h('button', { type: 'button', onclick: () => this.next() }, 'Далее');
    this.guide = h('div', { id: 'tutorial-guide', hidden: '' },
      h('section', { class: 'tutorial-card', 'aria-live': 'polite' },
        this.count, this.title, this.text, this.action,
        h('div', { class: 'tutorial-actions' },
          this.nextButton,
          h('button', { type: 'button', class: 'secondary', onclick: () => this.finish() }, 'Пропустить'))));
    root.append(this.choice, this.guide);
  }

  offer() {
    this.stop();
    this.choice.hidden = false;
  }

  answer(yes) {
    if (this.choice.hidden) return;
    this.choice.hidden = true;
    this.onChoose(yes);
  }

  start() {
    this.choice.hidden = true;
    this.active = true;
    this.step = 0;
    this.guide.hidden = false;
    this.renderStep();
  }

  renderStep() {
    const s = STEPS[this.step];
    if (!s) return;
    this.count.textContent = 'ОБУЧЕНИЕ  ·  ' + (this.step + 1) + ' / ' + STEPS.length;
    this.title.textContent = s.title;
    this.text.textContent = s.text;
    this.action.textContent = s.action;
    this.nextButton.textContent = this.step === STEPS.length - 1 ? 'В бой' : 'Далее';
  }

  progress(event, value) {
    if (!this.active) return;
    const s = STEPS[this.step];
    if (s.event === 'move' && event === 'move' && value > .3) this.next();
    else if (s.event === 'block' && event === 'block') this.next();
  }

  next() {
    if (!this.active) return;
    this.step++;
    if (this.step >= STEPS.length) this.finish();
    else this.renderStep();
  }

  finish() {
    if (!this.active) return;
    this.stop();
    this.onFinish();
  }

  stop() {
    this.active = false;
    this.choice.hidden = true;
    this.guide.hidden = true;
  }
}
