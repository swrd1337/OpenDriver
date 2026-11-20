// OpenDriver · main.js
// Connect / disconnect and start-up. Loaded last.

/* =========================================================
   Connection and start-up
   ========================================================= */
function setConnected(state, label) {
  connected = state;
  if (!state) {
    light = null; for (const k in info) delete info[k];
    matrixRows = []; keymap.forEach(m => m.clear()); kmSel = null;
    keyColors.clear(); savedColors = new Map(); ckDirty = false;
    Object.values(perf).forEach(m => m.clear()); acSel.clear(); rejectedRates.clear();
    setTravelRunning(false);
    renderInfo(); renderLighting(); refreshKeyboards(true); $('kbLegend').textContent = '—';
  }
  $('statusBadge').className = 'badge' + (state ? (demo ? ' demo' : ' live') : '');
  $('statusText').textContent = label;
  $('emptyState').hidden = state; $('overviewContent').hidden = !state;
  $('refreshBtn').disabled = !state;
  $('connectBtn').querySelector('span').textContent = state ? 'Disconnect' : 'Connect keyboard';
  $('connectBtn').className = 'btn btn-sm ' + (state ? 'btn-outline' : 'btn-primary');
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
      toast('Could not connect', /open/i.test(e.message) ? 'The device is busy. Close the Ajazz web driver and try again.' : e.message, true);
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

$('connectBtn').onclick = connect;
$('connectBtn2').onclick = connect;
$('refreshBtn').onclick = readAll;
if ('hid' in navigator) {
  navigator.hid.addEventListener('disconnect', e => {
    if (e.device === dev) { dev = null; setConnected(false, 'Disconnected'); toast('Keyboard disconnected', 'Plug it back in: it reconnects automatically.', true); }
  });
  navigator.hid.addEventListener('connect', e => { if (isConfigInterface(e.device)) reconnect(); });
}

buildAllKeyboards();
renderInfo();
renderKeymap();
renderLog();
reconnect();
