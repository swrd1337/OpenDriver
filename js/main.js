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

async function connect() {
  if (connected) {
    try { if (dev) await dev.close(); } catch {}
    dev = null; setConnected(false, 'Disconnected'); return;
  }
  if (demo) { setConnected(true, 'Demo device'); await readAll(); return; }
  if (!('hid' in navigator)) { toast('WebHID not available', 'Open this page in Chrome or Edge.', true); return; }
  try {
    const [d] = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x1CA4, productId: 0x0601, usagePage: 0xFFA0, usage: 1 }] });
    if (!d) return;
    dev = d;
    if (!dev.opened) await dev.open();
    dev.oninputreport = onInput;
    setConnected(true, 'Connected');
    toast('Keyboard connected', 'Reading settings…');
    await readAll();
  } catch (e) {
    toast('Could not connect', /open/i.test(e.message) ? 'The device is busy. Close the Ajazz web driver and try again.' : e.message, true);
  }
}
$('connectBtn').onclick = connect;
$('connectBtn2').onclick = connect;
$('refreshBtn').onclick = readAll;
if ('hid' in navigator) navigator.hid.addEventListener('disconnect', e => {
  if (e.device === dev) { dev = null; setConnected(false, 'Disconnected'); toast('Keyboard disconnected', 'Plug it back in and connect again.', true); }
});

buildAllKeyboards();
renderInfo();
renderKeymap();
renderLog();
