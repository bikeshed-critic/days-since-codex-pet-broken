const DAY = 86_400_000;

export function elapsedDays(start, now = Date.now()) {
  return Math.max(0, Math.floor((now - Date.parse(start)) / DAY));
}

export function initCounter(element, start, locale, now = Date.now) {
  const origin = Date.parse(start);
  if (!element || !Number.isFinite(origin)) return;
  const document = element.ownerDocument;
  const window = document.defaultView;
  const format = new Intl.NumberFormat(locale);
  let timer;

  function update() {
    window.clearTimeout(timer);
    const current = now();
    element.textContent = format.format(elapsedDays(start, current));
    if (document.hidden) return;
    // Wake at the next full day; also notice clock changes within a minute.
    const nextDay = origin + (elapsedDays(start, current) + 1) * DAY;
    timer = window.setTimeout(update, Math.min(60_000, Math.max(1, nextDay - current)));
  }

  document.addEventListener('visibilitychange', update);
  window.addEventListener('pageshow', update);
  update();
}
