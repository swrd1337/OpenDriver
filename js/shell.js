// OpenDriver · shell.js
// App shell: packet console, toasts, page navigation and theme.

/* =========================================================
   Console, toasts, navigation, theme
   ========================================================= */
function addLog(dir, bytes) {
  logRows.push({ t: new Date().toLocaleTimeString([], { hour12: false }), dir, h: hex(bytes) });
  if (logRows.length > 500) logRows.shift();
  if ($('page-console').classList.contains('active')) renderLog();
}
function renderLog() {
  $('logCount').textContent = `${logRows.length} packet${logRows.length === 1 ? '' : 's'}`;
  $('log').innerHTML = logRows.length
    ? logRows.slice().reverse().map(r => `<div class="log-row"><span class="t">${r.t}</span><span class="d ${r.dir}">${r.dir.toUpperCase()}</span><span class="h">${r.h}</span></div>`).join('')
    : '<div class="empty-note" style="margin:20px">No traffic yet. Connect the keyboard to see packets here.</div>';
}
$('clearLog').onclick = () => { logRows.length = 0; renderLog(); };
$('copyLog').onclick = async () => {
  try { await navigator.clipboard.writeText(logRows.map(r => `${r.t} ${r.dir.toUpperCase()} ${r.h}`).join('\n')); toast('Log copied', `${logRows.length} packets on the clipboard.`); }
  catch { toast('Could not copy', 'Clipboard access was blocked.', true); }
};

function toast(title, body, err = false) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<svg viewBox="0 0 24 24" class="i ${err ? 'err' : 'ok'}"><circle cx="12" cy="12" r="10"/>${err ? '<path d="M12 8v4M12 16h.01"/>' : '<path d="m9 12 2 2 4-4"/>'}</svg><div><b></b><span></span></div>`;
  el.querySelector('b').textContent = title; el.querySelector('span').textContent = body;
  const box = $('toasts');
  while (box.children.length > 2) box.firstChild.remove();
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 200); }, 2600);
}

function go(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  document.querySelectorAll('.nav-item[data-page]').forEach(b => {
    if (b.dataset.page === page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (page === 'console') renderLog();
  if (page === 'keymap') renderKeymap();
  if (page === 'actuation') renderPerf(); else setTravelRunning(false);
}
document.querySelectorAll('.nav-item[data-page]').forEach(b => b.onclick = () => go(b.dataset.page));
document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => go(b.dataset.goto));

const root = document.documentElement;
try { const t = localStorage.getItem('od-theme'); if (t) root.dataset.theme = t; } catch {}
$('themeBtn').onclick = () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('od-theme', root.dataset.theme); } catch {}
};
