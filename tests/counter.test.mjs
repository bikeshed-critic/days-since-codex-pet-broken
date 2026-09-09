import test from 'node:test';
import assert from 'node:assert/strict';
import { elapsedDays, initCounter } from '../site/counter.mjs';

const start = '2026-07-19T13:42:00Z';
const origin = Date.parse(start);
const DAY = 86_400_000;

test('counts full 24-hour periods, not local calendar changes', () => {
  assert.equal(elapsedDays(start, origin + DAY - 1), 0);
  assert.equal(elapsedDays(start, origin + DAY), 1);
  assert.equal(elapsedDays(start, origin + 53 * DAY), 53);
  assert.equal(elapsedDays(start, origin - DAY), 0);
  assert.equal(elapsedDays('2026-07-19T21:42:00+08:00', origin + DAY), 1);
  // US daylight-saving change: adjacent midnights can be only 23 hours apart.
  assert.equal(elapsedDays('2026-03-08T00:00:00-05:00', Date.parse('2026-03-09T00:00:00-04:00')), 0);
});

test('updates stale HTML immediately, at rollover, and after a sleeping tab returns', () => {
  const document = new EventTarget();
  const window = new EventTarget();
  document.defaultView = window;
  document.hidden = false;
  const timers = new Map();
  let id = 0, current = origin + 5 * DAY - 50;
  window.setTimeout = (callback, delay) => { timers.set(++id, { callback, delay }); return id; };
  window.clearTimeout = id => timers.delete(id);
  const element = { textContent: '2', ownerDocument: document };
  initCounter(element, start, 'en', () => current);
  assert.equal(element.textContent, '4');
  assert.equal([...timers.values()][0].delay, 50);
  current += 50;
  [...timers.values()][0].callback();
  assert.equal(element.textContent, '5');
  assert.equal(timers.size, 1);

  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(timers.size, 0);
  current += 3 * DAY;
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(element.textContent, '8');
  assert.equal(timers.size, 1);

  current -= DAY;
  window.dispatchEvent(new Event('pageshow'));
  assert.equal(element.textContent, '7');
  assert.equal(timers.size, 1);
});
