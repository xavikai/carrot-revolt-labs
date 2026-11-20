import { say } from './ui.js';

const copy = {
  start: ['Start the guided exercise', 'Inicia l’exercici guiat', 'Inicia el ejercicio guiado'],
  restart: ['Start again', 'Torna a començar', 'Vuelve a empezar'],
  exit: ['Leave guide', 'Surt de la guia', 'Sal de la guía'],
  next: ['Next step', 'Pas següent', 'Paso siguiente'],
  finish: ['Finish', 'Acaba', 'Termina'],
  expected: ['What you should see', 'Què hauries de veure', 'Qué deberías ver'],
  correct: ['Step complete.', 'Pas completat.', 'Paso completado.'],
  restore: ['Restore the original setup or start the guide again.',
    'Recupera la configuració inicial o torna a començar la guia.',
    'Recupera la configuración inicial o vuelve a empezar la guía.'],
  completed: ['Guided exercise complete.', 'Exercici guiat completat.', 'Ejercicio guiado completado.'],
  step: ['Step', 'Pas', 'Paso'],
  of: ['of', 'de', 'de'],
};

export function matchesStep(step, state) {
  return Object.entries(step.wires ?? {}).every(([to, from]) => (state.links.get(to) ?? null) === from)
    && Object.entries(step.values ?? {}).every(([key, value]) => state.values.get(key) === value);
}

export function guidedExercise(panel, viewport, { name, steps, start, state, allowed }) {
  let index = -1;
  let completed = false;
  panel.innerHTML = `
    <div class="guide-bar"><strong data-guide="title"></strong>
      <button type="button" data-guide="start"></button>
      <button type="button" data-guide="exit" hidden></button>
    </div>
    <div data-guide="step" hidden>
      <p data-guide="action"></p>
      <p><strong data-guide="expected-label"></strong> <span data-guide="expected"></span></p>
      <div class="guide-bar">
        <p data-guide="feedback" role="status"></p>
        <button type="button" data-guide="next" disabled></button>
      </div>
    </div>
    <p data-guide="completed" role="status" hidden></p>`;
  const el = key => panel.querySelector('[data-guide="' + key + '"]');
  const isActive = () => index >= 0;

  function targets(step) {
    viewport.querySelectorAll('.guide-target').forEach(element => element.classList.remove('guide-target'));
    if (!step) return [];
    return (step.focus ?? []).map(([kind, key]) => {
      const element = viewport.querySelector('[data-' + kind + '="' + key + '"]');
      element?.classList.add('guide-target');
      return element;
    }).filter(Boolean);
  }

  function reveal() {
    const selected = targets(steps[index]);
    if (!selected.length) return;
    const rects = selected.map(element => element.getBoundingClientRect());
    const frame = viewport.getBoundingClientRect();
    const left = Math.min(...rects.map(rect => rect.left));
    const right = Math.max(...rects.map(rect => rect.right));
    const top = Math.min(...rects.map(rect => rect.top));
    const bottom = Math.max(...rects.map(rect => rect.bottom));
    if (left < frame.left + 12 || right > frame.right - 12 || top < frame.top || bottom > frame.bottom) {
      const primary = rects[0];
      const x = right - left > viewport.clientWidth - 24 ? primary.left : (left + right - viewport.clientWidth) / 2;
      viewport.scrollBy(x - frame.left, (top + bottom - viewport.clientHeight) / 2 - frame.top);
    }
  }

  function update() {
    const active = isActive();
    const step = active ? steps[index] : null;
    const ready = !active || allowed();
    const correct = active && ready && matchesStep(step, state());
    const status = correct ? say(copy.correct) : ready ? '' : say(copy.restore);
    if (el('feedback').textContent !== status) el('feedback').textContent = status;
    el('next').disabled = !correct;
    targets(step);
  }

  function render() {
    const active = isActive();
    el('title').textContent = say(name) + (active ? ' · ' + say(copy.step) + ' ' + (index + 1) + ' ' + say(copy.of) + ' ' + steps.length : '');
    el('start').textContent = say(active || completed ? copy.restart : copy.start);
    el('exit').textContent = say(copy.exit);
    el('exit').hidden = !active;
    el('step').hidden = !active;
    el('completed').hidden = !completed;
    el('completed').textContent = completed ? say(copy.completed) : '';
    if (active) {
      el('action').textContent = say(steps[index].action);
      el('expected-label').textContent = say(copy.expected) + '.';
      el('expected').textContent = say(steps[index].expected);
      el('next').textContent = say(index === steps.length - 1 ? copy.finish : copy.next);
    }
    update();
  }

  function begin() {
    index = 0;
    completed = false;
    start();
    render();
    reveal();
    el('action').setAttribute('tabindex', '-1');
    el('action').focus({ preventScroll: true });
  }

  function leave() {
    if (!isActive() && !completed) return;
    index = -1;
    completed = false;
    render();
  }

  el('start').addEventListener('click', begin);
  el('exit').addEventListener('click', () => { leave(); el('start').focus({ preventScroll: true }); });
  el('next').addEventListener('click', () => {
    if (!isActive() || !allowed() || !matchesStep(steps[index], state())) return;
    index++;
    if (index === steps.length) {
      index = -1;
      completed = true;
      render();
      el('start').focus({ preventScroll: true });
    } else {
      render();
      reveal();
      el('action').focus({ preventScroll: true });
    }
  });
  render();
  return { update, render, leave, begin, isActive };
}
