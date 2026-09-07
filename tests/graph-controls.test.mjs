import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initGraph } from '../site/graph.mjs';

const messages = JSON.parse(await readFile(new URL('../locales/en.json', import.meta.url), 'utf8'));

class Element {
  constructor(dataset = {}, attributes = {}) {
    this.dataset = dataset;
    this.attributes = new Map(Object.entries(attributes));
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value) };
    this.hidden = true;
    this.captured = null;
  }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler); this.listeners.set(type, handlers);
  }
  emit(type, values = {}) {
    const event = { target: this, pointerId: 1, isPrimary: true, button: 0, detail: 1,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...values };
    for (const handler of this.listeners.get(type) ?? []) handler(event);
    return event;
  }
  getAttribute(name) { return this.attributes.get(name); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  hasAttribute(name) { return this.attributes.has(name); }
  setPointerCapture(id) { this.captured = id; }
  hasPointerCapture(id) { return this.captured === id; }
  releasePointerCapture() { this.captured = null; }
  matches() { return true; }
}

function fixture(reduce = false, precomputed = false) {
  const document = new Element(), media = new Element();
  document.hidden = false; media.matches = reduce;
  const ids = new Map(['graph-controls', 'graph-motion', 'graph-reset', 'graph-interaction'].map(id => [id, new Element()]));
  document.getElementById = id => ids.get(id);
  const frames = new Map();
  let nextFrame = 1, time = 0, intersection;
  document.defaultView = {
    matchMedia: () => media,
    requestAnimationFrame: handler => { const id = nextFrame++; frames.set(id, handler); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    IntersectionObserver: class { constructor(callback) { intersection = callback; } observe() {} },
  };
  const svg = new Element();
  svg.dataset.layoutSettled = String(precomputed);
  svg.ownerDocument = document;
  svg.viewBox = { baseVal: { width: 1120, height: 580 } };
  const nodes = [new Element({ nodeId: '1' }), new Element({ nodeId: '2' })];
  nodes.forEach((node, i) => { node.querySelector = () => new Element({}, { x: 120 + i * 600, y: 171 }); });
  const path = new Element({ edgeFrom: '1', edgeTo: '2', edgeType: 'reference' });
  svg.querySelectorAll = selector => selector === '[data-node-id]' ? nodes : [path];
  svg.contains = target => nodes.includes(target);
  svg.getScreenCTM = () => ({ inverse: () => ({ scale: 2 }) });
  // Mimic a graph rendered at half size, including a scrolled viewport offset.
  svg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: (this.x - 10) * 2, y: (this.y - 20) * 2 }; } });
  const graph = initGraph(svg, messages);
  return {
    graph, ids, nodes, path, frames, svg, document, media,
    visible(value) { intersection([{ isIntersecting: value }]); },
    tick() {
      const callbacks = [...frames.values()]; frames.clear(); time += 17;
      callbacks.forEach(callback => callback(time));
    },
  };
}

test('offscreen and hidden-page suspension, pause/resume, and reset preserve a usable graph', () => {
  const f = fixture();
  assert.equal(f.ids.get('graph-controls').hidden, false);
  assert.equal(f.frames.size, 0);
  f.visible(true); f.tick();
  const moved = f.nodes[0].getAttribute('transform');
  assert.notEqual(moved, 'translate(0.00 0.00)');
  f.ids.get('graph-motion').emit('click');
  assert.equal(f.frames.size, 0);
  f.tick(); assert.equal(f.nodes[0].getAttribute('transform'), moved);
  f.ids.get('graph-reset').emit('click');
  assert.equal(f.nodes[0].getAttribute('transform'), 'translate(0.00 0.00)');
  assert.equal(f.frames.size, 0, 'reset must respect an explicit pause');
  f.ids.get('graph-motion').emit('click');
  assert.equal(f.frames.size, 1);
  f.visible(false); assert.equal(f.frames.size, 0);
  f.visible(true); assert.equal(f.frames.size, 1);
  f.document.hidden = true; f.document.emit('visibilitychange');
  assert.equal(f.frames.size, 0);
});

test('reduced motion applies at startup and reacts to preference changes and filters', () => {
  const f = fixture(true);
  f.visible(true);
  assert.equal(f.frames.size, 0);
  assert.equal(f.ids.get('graph-motion').disabled, true);
  f.path.setAttribute('hidden', ''); f.graph.updateLinks();
  assert.equal(f.frames.size, 0);
  assert.equal(f.nodes[0].getAttribute('transform'), undefined);
  f.media.matches = false; f.media.emit('change');
  assert.equal(f.frames.size, 1);
  f.tick();
  f.media.matches = true; f.media.emit('change');
  assert.equal(f.frames.size, 0);
});

test('dragging uses SVG coordinates and suppresses navigation only for the completed drag', () => {
  const f = fixture(true), node = f.nodes[0];
  node.emit('pointerdown', { clientX: 110, clientY: 120 });
  node.emit('pointermove', { clientX: 160, clientY: 150 });
  assert.equal(node.getAttribute('transform'), 'translate(100.00 60.00)');
  assert.equal(f.frames.size, 0, 'direct manipulation does not override reduced motion');
  node.emit('pointerup');
  assert.equal(node.captured, null);
  assert.equal(node.emit('click').defaultPrevented, true);
  assert.equal(node.emit('click', { detail: 0 }).defaultPrevented, undefined);
  node.emit('pointerdown', { clientX: 160, clientY: 150 });
  node.emit('pointermove', { clientX: 161, clientY: 151 });
  node.emit('pointerup');
  assert.equal(node.emit('click').defaultPrevented, undefined, 'tiny movement remains a normal click');
  assert.equal(node.emit('click', { ctrlKey: true }).defaultPrevented, undefined);
});

test('cancelled pointer capture releases the node and keyboard navigation freezes motion', () => {
  const f = fixture(), node = f.nodes[0];
  f.visible(true);
  node.emit('pointerdown', { clientX: 110, clientY: 120 });
  node.emit('pointermove', { clientX: 160, clientY: 150 });
  node.emit('pointercancel');
  assert.equal(node.captured, null);
  assert.equal(node.classes.has('dragging'), false);
  f.svg.emit('focusin', { target: node });
  assert.equal(f.frames.size, 0);
  f.svg.emit('focusout', { relatedTarget: f.nodes[1] });
  assert.equal(f.frames.size, 0);
  f.svg.emit('focusout', { relatedTarget: null });
  assert.equal(f.frames.size, 1);
});

test('motion cools to a stop and can be restarted without changing the source links', () => {
  const f = fixture();
  f.visible(true);
  for (let i = 0; i < 500; i++) f.tick();
  assert.equal(f.frames.size, 0);
  assert.equal(f.ids.get('graph-motion').textContent, messages.graph_motion_resume);
  assert.equal(f.path.dataset.edgeFrom, '1'); assert.equal(f.path.dataset.edgeTo, '2');
  assert.doesNotMatch(f.path.getAttribute('d'), /NaN|Infinity/);
  f.ids.get('graph-motion').emit('click');
  assert.equal(f.frames.size, 1);
});

test('mouse hover keeps the link still and releases it on leave, while respecting motion preferences', () => {
  const f = fixture(), node = f.nodes[0];
  f.visible(true);
  node.emit('pointerenter', { pointerType: 'mouse' });
  for (let i = 0; i < 20; i++) f.tick();
  assert.equal(node.getAttribute('transform'), 'translate(0.00 0.00)');
  node.emit('pointerdown', { clientX: 110, clientY: 120 });
  node.emit('pointerup');
  f.tick();
  assert.equal(node.getAttribute('transform'), 'translate(0.00 0.00)', 'releasing a click must preserve the hovered anchor');
  node.emit('pointerleave');
  f.tick();
  assert.notEqual(node.getAttribute('transform'), 'translate(0.00 0.00)');
  f.ids.get('graph-motion').emit('click');
  node.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(f.frames.size, 0, 'hover must respect pause');
  const reduced = fixture(true);
  reduced.visible(true);
  reduced.nodes[0].emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(reduced.frames.size, 0, 'hover must respect reduced motion');
});

test('a precomputed graph does no startup work and reset restores its still layout', () => {
  const f = fixture(false, true);
  f.visible(true);
  assert.equal(f.frames.size, 0);
  assert.equal(f.nodes[0].getAttribute('transform'), undefined);
  f.nodes[0].emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(f.frames.size, 1, 'interaction should still wake the graph');
  f.nodes[0].emit('pointerleave');
  f.tick();
  f.ids.get('graph-reset').emit('click');
  assert.equal(f.frames.size, 0);
  assert.equal(f.nodes[0].getAttribute('transform'), 'translate(0.00 0.00)');
});
