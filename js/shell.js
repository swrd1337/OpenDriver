// OpenDriver · shell.js
// App shell: packet console, toasts, page navigation and theme.

/* =========================================================
   Console, toasts, navigation, theme
   ========================================================= */
let logFilter = 'all'; // all | kb | ms
function addLog(dir, bytes, src = 'kb') {
  logRows.push({ t: new Date().toLocaleTimeString([], { hour12: false }), dir, src, h: hex(bytes) });
  if (logRows.length > 3000) logRows.shift(); // room for both devices: one mouse read is ~40 packets
  if ($('page-console').classList.contains('active')) renderLog();
}
const shownRows = () => logFilter === 'all' ? logRows : logRows.filter(r => r.src === logFilter);
const SRC_LABEL = { kb: 'KB', ms: 'MS' };
function renderLog() {
  const rows = shownRows();
  $('logCount').textContent = `${rows.length} packet${rows.length === 1 ? '' : 's'}`;
  $('log').innerHTML = rows.length
    ? rows.slice().reverse().map(r => `<div class="log-row"><span class="t">${r.t}</span><span class="d ${r.dir}">${SRC_LABEL[r.src]} ${r.dir.toUpperCase()}</span><span class="h">${r.h}</span></div>`).join('')
    : '<div class="empty-note" style="margin:20px">No traffic yet. Connect the keyboard or the mouse to see packets here.</div>';
}
document.querySelectorAll('#logFilter button').forEach(b => b.onclick = () => {
  logFilter = b.dataset.src;
  document.querySelectorAll('#logFilter button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  renderLog();
});
$('clearLog').onclick = () => { logRows.length = 0; renderLog(); };
$('copyLog').onclick = async () => {
  const rows = shownRows();
  try { await navigator.clipboard.writeText(rows.map(r => `${r.t} ${SRC_LABEL[r.src]} ${r.dir.toUpperCase()} ${r.h}`).join('\n')); toast('Log copied', `${rows.length} packets on the clipboard.`); }
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
