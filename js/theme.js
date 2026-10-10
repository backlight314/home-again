// Day / night look, shared by the game (index.html) and the Family Workshop (family.html).
// The choice is saved in localStorage and applied as <html data-time="day|night"> before first paint.
(function () {
  const KEY = 'homeAgain.time';
  let mode = 'night';
  try {
    if (localStorage.getItem(KEY) === 'day') mode = 'day';
  } catch (_) {}
  const root = document.documentElement;
  root.dataset.time = mode;

  const SUN =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7"/></svg>';
  const MOON =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11z"/></svg>';

  let btn = null;
  function paint() {
    if (!btn) return;
    const toDay = mode === 'night';
    btn.innerHTML = (toDay ? SUN : MOON) + '<span>' + (toDay ? 'Day' : 'Night') + '</span>';
    btn.setAttribute('aria-label', toDay ? 'Switch to daytime' : 'Switch to nighttime');
    btn.setAttribute('aria-pressed', String(mode === 'day'));
  }

  function set(next) {
    mode = next === 'day' ? 'day' : 'night';
    root.dataset.time = mode;
    try {
      localStorage.setItem(KEY, mode);
    } catch (_) {}
    paint();
    window.dispatchEvent(new CustomEvent('homeagain:time', { detail: mode }));
  }

  window.HomeAgainTime = { get: () => mode, set, toggle: () => set(mode === 'day' ? 'night' : 'day') };

  function mount() {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'timeToggle';
    btn.addEventListener('click', () => window.HomeAgainTime.toggle());
    const slot = document.getElementById('links'); // the Family Workshop header
    if (slot) {
      btn.classList.add('inline');
      slot.prepend(btn);
    } else {
      document.body.appendChild(btn);
    }
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
