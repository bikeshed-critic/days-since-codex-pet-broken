import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeStatus, refreshStatuses, stateLabel, interpolate } from '../site/refresh.mjs';

const messages = JSON.parse(await readFile(new URL('../locales/en.json', import.meta.url), 'utf8'));
const raw = (number, state = 'open') => ({ number, state, state_reason: state === 'closed' ? 'completed' : null,
  html_url: `https://github.com/openai/codex/issues/${number}`, body: 'Not for storage or display', user: { login: 'not-needed' } });
const response = (number, state) => ({ ok: true, status: 200, json: async () => raw(number, state) });

test('fresh responses expose only issue number and state, without credentials', async () => {
  const result = await refreshStatuses([41513], { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/openai/codex/issues/41513');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.deepEqual(Object.keys(options.headers), ['Accept']);
    return response(41513, 'closed');
  } });
  assert.deepEqual(result.states.get(41513), { number: 41513, state: 'closed', stateReason: 'completed' });
  assert.equal(result.failures.size, 0);
  assert.equal(stateLabel(result.states.get(41513), messages), 'Closed / completed · live');
});

test('mismatched URLs, issue numbers, pull requests and invalid states are rejected', () => {
  for (const invalid of [raw(1), { ...raw(41513), html_url: 'https://example.com' }, { ...raw(41513), state: 'fixed' }, { ...raw(41513), pull_request: {} }, { ...raw(41513), state_reason: 'invented' }]) {
    assert.throws(() => normalizeStatus(invalid, 41513));
  }
});

test('one unavailable issue does not discard successful states or invent a closed state', async () => {
  const result = await refreshStatuses([41513, 41501, 41465], { fetchImpl: async url => {
    const number = Number(url.split('/').at(-1));
    if (number === 41501) throw new Error('offline');
    return response(number);
  } });
  assert.deepEqual([...result.states.keys()].sort(), [41465, 41513]);
  assert.deepEqual([...result.failures], [41501]);
  assert.equal(result.states.has(41501), false);
});

test('rate limiting stops new requests and leaves the static fallback available', async () => {
  let calls = 0;
  const result = await refreshStatuses(Array.from({ length: 16 }, (_, i) => i + 1), { fetchImpl: async () => {
    calls++;
    return { ok: false, status: 429 };
  } });
  assert.ok(calls <= 4);
  assert.equal(result.states.size, 0);
  assert.equal(result.failures.size, 16);
  assert.equal(result.rateLimited, true);
});

test('requests are bounded to four concurrent operations', async () => {
  let active = 0;
  let maximum = 0;
  const result = await refreshStatuses([1, 2, 3, 4, 5, 6, 7], { fetchImpl: async url => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return response(Number(url.split('/').at(-1)));
  } });
  assert.equal(maximum, 4);
  assert.equal(result.states.size, 7);
});

test('a hung request times out without fabricating a result', async () => {
  const result = await refreshStatuses([41513], { timeoutMs: 5, fetchImpl: async (_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  assert.equal(result.states.size, 0);
  assert.deepEqual([...result.failures], [41513]);
});

test('invalid selections fail before any network access', async () => {
  for (const numbers of [[], [1, 1], [-1], ['41513'], Array.from({ length: 101 }, (_, i) => i + 1)]) {
    await assert.rejects(refreshStatuses(numbers, { fetchImpl: () => assert.fail('must not fetch') }));
  }
});

test('message placeholders are substituted without treating content as code', () => {
  assert.equal(interpolate('{count} of {total} at {time}', { count: 2, total: 16, time: '<b>now</b>' }), '2 of 16 at <b>now</b>');
});

test('page wiring makes no background requests; filters and live labels change only on explicit actions', async () => {
  class Element {
    constructor(dataset = {}) {
      this.dataset = dataset;
      this.attributes = new Map([['aria-pressed', 'true']]);
      this.listeners = new Map();
      this.textContent = '';
      this.hidden = true;
      this.disabled = false;
      const classes = new Set();
      this.classList = { add: (...items) => items.forEach(item => classes.add(item)), remove: (...items) => items.forEach(item => classes.delete(item)) };
    }
    getAttribute(name) { return this.attributes.get(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    hasAttribute(name) { return this.attributes.has(name); }
    toggleAttribute(name, force) { if (force) this.attributes.set(name, ''); else this.attributes.delete(name); }
    addEventListener(name, handler) { this.listeners.set(name, handler); }
  }
  const byId = new Map(['page-data', 'filter-count', 'refresh', 'refresh-status', 'live-note'].map(id => [id, new Element()]));
  byId.get('page-data').textContent = JSON.stringify({ locale: 'en', issueNumbers: [41513, 41501], relationshipCount: 2, messages });
  const controls = [new Element({ filter: 'reference' }), new Element({ filter: 'hypothesis' })];
  const edges = [new Element({ edgeType: 'reference' }), new Element({ edgeType: 'hypothesis' })];
  const labels = new Map([[41513, new Element()], [41501, new Element()]]);
  labels.get(41513).textContent = labels.get(41501).textContent = 'Open · snapshot';
  const fieldset = new Element();
  const previous = { document: globalThis.document, fetch: globalThis.fetch, setTimeout: globalThis.setTimeout };
  const delayed = [];
  let requests = 0;
  try {
    globalThis.document = {
      getElementById: id => byId.get(id),
      querySelector: selector => { assert.equal(selector, '.filters'); return fieldset; },
      querySelectorAll: selector => {
        if (selector === '[data-filter]') return controls;
        if (selector === '[data-edge-type]') return edges;
        const match = selector.match(/^\[data-state-for="(\d+)"\]$/);
        return match ? [labels.get(Number(match[1]))] : [];
      },
    };
    globalThis.setTimeout = (fn, ms) => ms === 60000 ? delayed.push(fn) : previous.setTimeout(fn, ms);
    globalThis.fetch = async url => {
      requests++;
      const number = Number(url.split('/').at(-1));
      if (number === 41501) throw new Error('unavailable');
      return response(number, 'closed');
    };
    await import('../site/app.mjs');
    assert.equal(requests, 0);
    assert.equal(fieldset.hidden, false);
    controls[0].listeners.get('click')();
    assert.equal(edges[0].hasAttribute('hidden'), true);
    assert.equal(edges[1].hasAttribute('hidden'), false);
    assert.equal(byId.get('filter-count').textContent, '1 of 2 relationships shown');
    controls[0].listeners.get('click')();
    assert.equal(edges[0].hasAttribute('hidden'), false);
    await byId.get('refresh').listeners.get('click')();
    assert.equal(requests, 2);
    assert.equal(labels.get(41513).textContent, 'Closed / completed · live');
    assert.equal(labels.get(41501).textContent, 'Open · snapshot');
    assert.match(byId.get('refresh-status').textContent, /Checked 1 of 2/);
    assert.equal(byId.get('refresh').disabled, true);
    delayed[0]();
    assert.equal(byId.get('refresh').disabled, false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
