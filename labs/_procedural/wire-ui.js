import { replaceWire } from './node-links.js';

export function enableWiring(viewport, graph, { layout, links, model, apply, message, path }) {
  let gesture = null;
  let armed = null;
  let frame = 0;
  const socketButton = target => {
    if (!target || target.closest('input, select')) return null;
    return target.closest('[data-port]') ?? target.closest('.socket')?.querySelector('[data-port]');
  };
  const portAt = (x, y) => {
    const button = socketButton(document.elementFromPoint(x, y));
    return graph.contains(button) ? button.dataset.port : null;
  };
  const restoreFocus = key => graph.querySelector('[data-port="' + key + '"]')?.focus({ preventScroll: true });
  const clear = () => {
    cancelAnimationFrame(frame);
    gesture = null;
    armed = null;
    graph.querySelector('.drag-wire')?.removeAttribute('d');
    graph.querySelectorAll('.port-active, .port-drop').forEach(el => el.classList.remove('port-active', 'port-drop'));
  };

  function connect(start, end, move) {
    const ports = model();
    if (!end || start === end) return false;
    const origin = ports.get(start), target = ports.get(end);
    const prev = move && !origin.output && links().has(start) ? start : null;
    const from = origin.output ? start : target.output ? end : prev && links().get(prev);
    const to = origin.output || !target.output ? end : start;
    if (!from) return false;
    const next = replaceWire(ports, links(), from, to, prev);
    if (!next) return false;
    apply(next, 'connected');
    restoreFocus(to);
    return true;
  }

  function remove(key) {
    const next = new Map(links());
    if (!next.delete(key)) return;
    apply(next, 'disconnected');
    restoreFocus(key);
  }

  function choose(key) {
    if (!armed || armed === key) {
      clear();
      armed = key;
      graph.querySelector('[data-port="' + key + '"]')?.classList.add('port-active');
      message('chooseSocket');
      return;
    }
    const first = armed;
    clear();
    if (!connect(first, key, false)) message('invalidWire');
  }

  function drawDrag() {
    if (!gesture?.moved) return;
    const { start, x, y } = gesture;
    const box = graph.getBoundingClientRect();
    const zoom = Number(graph.style.zoom) || 1;
    const here = { x: (x - box.left) / zoom, y: (y - box.top) / zoom };
    const origin = layout().get(start);
    const moving = !origin.output && links().has(start);
    const from = moving ? layout().get(links().get(start)) : origin;
    const wire = graph.querySelector('.drag-wire');
    if (!wire || !from) return;
    wire.setAttribute('d', origin.output || moving ? path(from, here) : path(here, from));
    graph.querySelector('.port-drop')?.classList.remove('port-drop');
    const end = portAt(x, y);
    if (end && end !== start) graph.querySelector('[data-port="' + end + '"]')?.classList.add('port-drop');
  }

  function scrollDuringDrag() {
    if (!gesture?.moved) return;
    const box = viewport.getBoundingClientRect();
    const { x, y } = gesture;
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
      const speed = (n, min, max) => n < min + 28 ? -8 : n > max - 28 ? 8 : 0;
      viewport.scrollBy(speed(x, box.left, box.right), speed(y, box.top, box.bottom));
      drawDrag();
    }
    frame = requestAnimationFrame(scrollDuringDrag);
  }

  viewport.addEventListener('pointerdown', event => {
    const port = socketButton(event.target);
    if (!port || event.button !== 0 || gesture) return;
    event.preventDefault();
    port.focus({ preventScroll: true });
    gesture = { start: port.dataset.port, x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5) return;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    if (!gesture.moved) {
      gesture.moved = true;
      graph.querySelector('[data-port="' + gesture.start + '"]')?.classList.add('port-active');
      frame = requestAnimationFrame(scrollDuringDrag);
    }
    drawDrag();
  });
  viewport.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const { start, moved } = gesture;
    gesture = null;
    cancelAnimationFrame(frame);
    if (!moved) {
      choose(start);
      return;
    }
    const end = portAt(event.clientX, event.clientY);
    clear();
    if (end === start) return;
    if (end) {
      if (!connect(start, end, true)) message('invalidWire');
    } else if (!model().get(start).output) {
      remove(start);
    }
  });
  viewport.addEventListener('pointercancel', clear);
  graph.addEventListener('click', event => {
    const port = event.target.closest('[data-port]');
    if (event.detail === 0 && port) choose(port.dataset.port);
  });
  viewport.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      clear();
      message(null);
    }
    const port = event.target.closest('[data-port]');
    if (port && ['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault();
      clear();
      remove(port.dataset.port);
    }
  });
  return clear;
}
