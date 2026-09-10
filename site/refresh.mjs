// The live view is ephemeral. Never persist responses or request credentials.
export function normalizeStatus(raw, number) {
  const validReasons = [null, 'completed', 'not_planned', 'reopened', 'duplicate'];
  if (raw.number !== number || raw.html_url !== `https://github.com/openai/codex/issues/${number}` ||
      raw.pull_request || !['open', 'closed'].includes(raw.state) ||
      !validReasons.includes(raw.state_reason ?? null)) {
    throw new Error('Unexpected issue response');
  }
  return { number, state: raw.state, stateReason: raw.state_reason ?? null };
}

export async function refreshStatuses(numbers, { fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  if (!Array.isArray(numbers) || !numbers.length || numbers.length > 100 ||
      new Set(numbers).size !== numbers.length || numbers.some(n => !Number.isSafeInteger(n) || n <= 0)) {
    throw new Error('Invalid issue selection');
  }
  const states = new Map();
  const failures = new Set();
  let cursor = 0;
  let rateLimited = false;
  const worker = async () => {
    while (cursor < numbers.length) {
      const number = numbers[cursor++];
      if (rateLimited) { failures.add(number); continue; }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`https://api.github.com/repos/openai/codex/issues/${number}`, {
          method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
          headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal,
        });
        if ([403, 429].includes(response.status)) rateLimited = true;
        if (!response.ok) throw new Error('GitHub unavailable');
        states.set(number, normalizeStatus(await response.json(), number));
      } catch {
        failures.add(number);
      } finally {
        clearTimeout(timer);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, numbers.length) }, worker));
  return { states, failures, rateLimited };
}

export function interpolate(message, values) {
  return message.replace(/\{([A-Za-z]+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}

export function stateLabel(status, messages, source = 'live') {
  const reason = status.state === 'closed' ? ` / ${messages[status.stateReason] ?? messages.unknown_reason}` : '';
  return `${messages[status.state]}${reason} · ${messages[source]}`;
}

export function graphStateLabel(status, messages, recovery, source = 'live') {
  const suffix = status.state === 'open' && recovery === 'uncontradicted' ? ` · ${messages.recovery_reported}` : '';
  return stateLabel(status, messages, source) + suffix;
}
