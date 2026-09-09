import { interpolate, refreshStatuses, stateLabel } from './refresh.mjs';
import { initGraph } from './graph.mjs';
import { initCounter } from './counter.mjs';

const config = JSON.parse(document.getElementById('page-data').textContent);
initCounter(document.getElementById('day-counter'), config.counterStartedAt, config.locale);
const messages = config.messages;
const filters = [...document.querySelectorAll('[data-filter]')];
const edges = [...document.querySelectorAll('[data-edge-type]')];
const count = document.getElementById('filter-count');
const graph = initGraph(document.getElementById('issue-graph'), messages);

for (const button of filters) {
  button.addEventListener('click', () => {
    button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
    const enabled = new Set(filters.filter(item => item.getAttribute('aria-pressed') === 'true').map(item => item.dataset.filter));
    for (const edge of edges) {
      // SVG does not implement HTMLElement.hidden. Use an attribute matched by CSS.
      edge.toggleAttribute('hidden', !enabled.has(edge.dataset.edgeType));
    }
    count.textContent = interpolate(messages.filter_count, {
      visible: edges.filter(edge => !edge.hasAttribute('hidden')).length,
      total: config.relationshipCount,
    });
    graph?.updateLinks();
  });
}
document.querySelector('.filters').hidden = false;
count.hidden = false;

const refresh = document.getElementById('refresh');
const status = document.getElementById('refresh-status');
refresh.hidden = false;
document.getElementById('live-note').hidden = false;
refresh.addEventListener('click', async () => {
  refresh.disabled = true;
  refresh.textContent = messages.refreshing;
  status.textContent = messages.refreshing;
  try {
    const result = await refreshStatuses(config.issueNumbers);
    for (const [number, live] of result.states) {
      for (const label of document.querySelectorAll(`[data-state-for="${number}"]`)) {
        label.textContent = stateLabel(live, messages);
        label.classList.remove('open', 'closed');
        label.classList.add(live.state, 'live');
      }
    }
    const key = !result.states.size ? 'refresh_failed' : result.failures.size ? 'refresh_partial' : 'refresh_success';
    const time = new Intl.DateTimeFormat(config.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
    status.textContent = `${interpolate(messages[key], { count: result.states.size, total: config.issueNumbers.length, time })} ${messages.refresh_cooldown}`;
  } catch {
    status.textContent = `${messages.refresh_failed} ${messages.refresh_cooldown}`;
  } finally {
    refresh.textContent = `${messages.refresh} ↻`;
    setTimeout(() => { refresh.disabled = false; }, 60000);
  }
});
