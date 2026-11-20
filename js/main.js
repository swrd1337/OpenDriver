// OpenDriver · main.js
// Connect / disconnect and start-up. Loaded last.

/* =========================================================
   Connection and start-up
   ========================================================= */
// One badge for both devices: keyboard state (from setConnected) plus the mouse.
let kbStatus = 'Disconnected';
function updateStatus() {
  const kb = connected, m = !!ms;
  $('statusBadge').className = 'badge' + (kb || m ? (demo ? ' demo' : ' live') : '');
  const kbName = demo ? 'Demo keyboard' : 'Keyboard';
  $('statusText').textContent = kb && m ? `${kbName} + mouse` : kb ? `${kbName} connected` : m ? (demo ? 'Demo mouse connected' : 'Mouse connected') : kbStatus;
  // header device menu: one button for both devices
  const any = kb || m, btnText = any ? 'Devices' : 'Connect';
  $('connectBtn').querySelector('span').textContent = btnText;
  $('connectBtn').setAttribute('aria-label', any ? 'Connected devices' : 'Connect a device'); // the text is hidden on phones
  $('connectBtn').className = 'btn btn-sm ' + (any ? 'btn-outline' : 'btn-primary');
  $('refreshBtn').disabled = !any;
  for (const [item, state, on] of [['devKb', 'devKbState', kb], ['devMs', 'devMsState', m]]) {
    $(item).classList.toggle('on', on); $(state).textContent = on ? 'Connected · Disconnect' : 'Connect';
  }
}
function setDevMenu(open) {
  $('devMenu').hidden = !open; $('connectBtn').setAttribute('aria-expanded', String(open));
  if (open) $('devKb').focus();
}
function setConnected(state, label) {
  connected = state;
  if (!state) {
    light = null; for (const k in info) delete info[k];
    matrixRows = []; keymap.forEach(m => m.clear()); kmSel = null;
    keyColors.clear(); savedColors = new Map(); ckDirty = false;
    Object.values(perf).forEach(m => m.clear()); acSel.clear(); rejectedRates.clear();
    setTravelRunning(false);
    renderInfo(); renderLighting(); refreshKeyboards(true); $('kbLegend').textContent = '—';
    kmUndo.length = 0; acUndo.length = 0; renderKmUndo(); renderAcUndo(); // undo history belongs to this connection
  }
  kbStatus = label;
  updateStatus();
  $('emptyState').hidden = state; $('overviewContent').hidden = !state;
  renderKeymap(); renderPerf();
}

const HID_FILTER = { vendorId: 0x1CA4, productId: 0x0601, usagePage: 0xFFA0, usage: 1 };
// Remembered per browser: reconnect on load / replug unless the user clicked Disconnect.
const AUTO_KEY = 'od-autoconnect';
const autoConnect = {
  get() { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; } },
  set(on) { try { on ? localStorage.setItem(AUTO_KEY, '1') : localStorage.removeItem(AUTO_KEY); } catch {} },
};
// the keyboard's vendor interface (0xFFA0), among the HID interfaces it exposes
const isConfigInterface = d => d.vendorId === HID_FILTER.vendorId && d.productId === HID_FILTER.productId &&
  d.collections.some(c => c.usagePage === HID_FILTER.usagePage && c.usage === HID_FILTER.usage);

let opening = false;
async function openDevice(d, { silent = false } = {}) {
  if (opening || connected) return;
  opening = true;
  try {
    if (!d.opened) await d.open();
    dev = d;
    dev.oninputreport = onInput;
    autoConnect.set(true);
    setConnected(true, 'Connected');
    toast(silent ? 'Keyboard reconnected' : 'Keyboard connected', 'Reading settings…');
    await readAll();
  } catch (e) {
    // silent (automatic) attempts stay quiet unless the device is busy, which the user can fix
    if (!silent || /open/i.test(e.message))
      toast('Could not connect', /open/i.test(e.message) ? 'The browser could not open the keyboard. Close the Ajazz web driver; on Linux, add the udev rule from the README.' : e.message, true);
  } finally { opening = false; }
}

async function connect() {
  if (connected) {
    autoConnect.set(false);
    try { if (dev) await dev.close(); } catch {}
    dev = null; setConnected(false, 'Disconnected'); return;
  }
  if (demo) { setConnected(true, 'Demo device'); await readAll(); return; }
  if (!('hid' in navigator)) { toast('WebHID not available', 'Open this page in Chrome or Edge.', true); return; }
  try {
    const [d] = await navigator.hid.requestDevice({ filters: [HID_FILTER] });
    if (d) await openDevice(d);
  } catch (e) { toast('Could not connect', e.message, true); }
}

// Reopen a keyboard this site was already allowed to use: no picker, no click needed.
async function reconnect() {
  if (demo || !('hid' in navigator) || !autoConnect.get() || connected) return;
  try {
    const d = (await navigator.hid.getDevices()).find(isConfigInterface);
    if (d) await openDevice(d, { silent: true });
  } catch {}
}

$('connectBtn').onclick = e => { e.stopPropagation(); setDevMenu($('devMenu').hidden); };
$('devKb').onclick = () => { setDevMenu(false); connect(); };
$('devMs').onclick = () => { setDevMenu(false); msConnect(); };
document.addEventListener('click', e => { if (!$('devMenu').hidden && !e.target.closest('.dev-menu-wrap')) setDevMenu(false); });
$('devMenu').addEventListener('keydown', e => {
  if (e.key === 'Escape') { setDevMenu(false); $('connectBtn').focus(); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); (document.activeElement === $('devKb') ? $('devMs') : $('devKb')).focus(); }
});
$('connectBtn2').onclick = connect;
$('ovMsBtn').onclick = () => ms ? go('mouse') : msConnect();
$('demoHint').hidden = demo;
// Re-read: everything that's connected, keyboard first
$('refreshBtn').onclick = async () => {
  $('refreshBtn').disabled = true;
  try {
    if (connected) await readAll();
    if (ms) await msRefresh();
    toast('Settings read again', [connected && 'keyboard', ms && 'mouse'].filter(Boolean).join(' and ').replace(/^./, c => c.toUpperCase()) + ' up to date.');
  } catch (e) { toast('Could not read', e.message, true); }
  finally { $('refreshBtn').disabled = !(connected || ms); }
};
if ('hid' in navigator) {
  navigator.hid.addEventListener('disconnect', e => {
    if (e.device === dev) { dev = null; setConnected(false, 'Disconnected'); toast('Keyboard disconnected', 'Plug it back in: it reconnects automatically.', true); }
  });
  navigator.hid.addEventListener('connect', e => { if (isConfigInterface(e.device)) reconnect(); });
}

buildAllKeyboards();
updateStatus();
renderMsOverview();
renderInfo();
renderKeymap();
renderLog();
reconnect();
msReconnect();
