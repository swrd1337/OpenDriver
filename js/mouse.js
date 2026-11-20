// OpenDriver · mouse.js
// Zaopin Z2 / Z4D mice (CompX vendor protocol): protocol, transport, connect, and the Mouse page core
// (DPI, polling rate, lift-off, performance). Buttons: mouse-buttons.js. Lighting: mouse-lighting.js.
// Separate from the keyboard: its own device, packets and page. See docs/MOUSE-PROTOCOL.md.

/* =========================================================
   Protocol
   ========================================================= */
const MS_VID = 0x3554, MS_REPORT = 8;
// wireless and wired product ids, from the official Zaopin driver's cfg.json
const MS_PIDS = [0xF524, 0xF50D, 0xF527, 0xF5D5, 0xF517, 0xF526, 0xF50F, 0xF511, 0xF515];
const MS_CMD = { HANDSHAKE: 1, ONLINE: 3, BATTERY: 4, WRITE: 7, READ: 8 };
const MS_ADDR = {
  RATE: 0, STAGES: 2, CURRENT: 4, LOD: 10, DPI: 12, COLOR: 44,
  DPI_FX_MODE: 76, DPI_FX_BRIGHT: 78, DPI_FX_SPEED: 80, DPI_FX_STATE: 82, KEYS: 96,
  LIGHT: 160, LIGHT_STATE: 167, DEBOUNCE: 169, MOTION_SYNC: 171, SLEEP: 173, ANGLE: 175, RIPPLE: 177, MOVING_OFF: 179,
  SHORTCUT: 256, MACRO: 768,
};
const MS_READ_LEN = 181; // 0..180 covers every single setting above (shortcuts and macros are read per button)
const MS_RATES = [[125, 8], [250, 4], [500, 2], [1000, 1], [2000, 16], [4000, 32], [8000, 64]]; // [Hz, stored value]
const MS_LINK = { 0: ['Wireless', 1000], 1: ['Wireless', 4000], 2: ['Wired', 1000], 3: ['Wired', 8000], 4: ['Wireless', 2000], 5: ['Wireless', 8000] };
// Zaopin is cid 7; the model id picks the sensor (cfg.json). xy: models whose driver shows separate X / Y DPI.
const MS_SENSORS = { 3395: { max: 26000, mids: [1, 2, 3, 7, 10, 11, 12, 13] }, 3950: { max: 30000, mids: [4, 5, 6, 8, 14, 15, 16], xy: [14, 15, 16] }, 3311: { max: 12000, mids: [9] } };
// PAW3311 stores a table value per 50 DPI step (sensor.json)
const MS_3311 = [1,2,3,4,5,6,8,9,10,11,12,14,15,16,17,18,19,21,22,23,24,25,27,28,29,30,31,32,34,35,36,37,38,39,41,42,43,44,45,47,48,49,50,51,52,54,55,56,57,58,59,61,62,63,64,65,67,68,69,70,71,72,74,75,76,77,78,79,81,82,83,84,85,87,88,89,90,91,92,94,95,96,97,98,99,101,102,103,104,105,107,108,109,110,111,112,114,115,116,117,118,119,121,122,123,124,125,127,128,129,130,131,132,134,135,136,137,138,139,141,142,143,144,145,147,148,149,150,151,152,154,155,156,157,158,159,161,162,163,164,165,167,168,169,170,171,172,174,175,176,177,178,179,181,182,183,184,185,187,188,189,190,191,192,194,195,196,197,198,199,201,202,203,204,205,207,208,209,210,211,212,214,215,216,217,218,219,221,222,223,224,225,227,228,229,230,231,232,234,235];
const MS_LOD = { general: [[1, '1 mm'], [2, '2 mm']], 3950: [[3, '0.7 mm'], [1, '1 mm'], [2, '2 mm']] };
const MS_SLEEP = [[1, '10 s'], [3, '30 s'], [6, '1 min'], [12, '2 min'], [18, '3 min'], [30, '5 min'], [60, '10 min'], [90, '15 min']]; // stored in 10 s units
const MS_DEBOUNCE_MAX = 15, MS_DEBOUNCE_TIP = 8; // cfg.json maxDebounce / tipsDebounce
const MS_BUTTONS = ['Left button', 'Right button', 'Wheel button', 'Back button', 'Forward button', 'DPI button']; // flash order (cfg.json "keys")

// 16-byte report 8. Byte 15 makes the sum of all bytes plus the report id equal 0x55.
function msPack(cmd, addr = 0, data = [], len = data.length) {
  const p = new Uint8Array(16);
  p[0] = cmd; p[2] = addr >> 8; p[3] = addr & 255; p[4] = len; p.set(data, 5);
  p[15] = 85 - p.slice(0, 15).reduce((a, b) => a + b, 0) - MS_REPORT; // Uint8Array wraps mod 256
  return p;
}
const msSum = a => a.reduce((s, b) => s + b, 0);
// A single-byte setting is stored as [value, 0x55 - value]; longer records end in one check byte (0x55 - sum).
const msPair = v => [v, 85 - v & 255];
const msRecord = b => [...b, 85 - msSum(b) & 255];

// One DPI axis -> stored value + range flags (the driver's xl()).
function dpiValue(dpi, sensor) {
  if (sensor === '3311') { const hi = dpi > 10000; return { v: MS_3311[((hi ? dpi / 2 : dpi) - 50) / 50], ex: hi ? 0x22 : 0 }; }
  return { v: dpi / 50 - 1, ex: 0 };
}
// Stored value + flags -> DPI (the driver's hl()). Unknown 3311 values decode to 0.
function dpiFromValue(v, flags, sensor) {
  const base = sensor === '3311' ? (MS_3311.indexOf(v) + 1) * 50 : (v + 1) * 50;
  return base * (flags & 1 ? 2 : 1) * (flags & 2 ? 2 : 1);
}
// DPI stage: [x, y, x high bits <<2 | y high bits <<6 | flags, check].
function dpiEncode(x, sensor, y = x) {
  const a = dpiValue(x, sensor), b = dpiValue(y, sensor);
  return msRecord([a.v & 255, b.v & 255, ((a.v >> 8) << 2 | (b.v >> 8) << 6 | a.ex | b.ex << 4) & 255]);
}
const dpiDecode = (b, sensor) => dpiFromValue(b[0] | (b[2] >> 2 & 3) << 8, b[2] & 3, sensor);
const dpiDecodeY = (b, sensor) => dpiFromValue(b[1] | (b[2] >> 6 & 3) << 8, b[2] >> 4 & 3, sensor);
// DPI indicator brightness 1..10 <-> stored byte (the driver's Sl() / Cl())
const fxBrightToByte = e => ({ 1: 16, 5: 128, 9: 230, 10: 255 })[e] ?? 30 * (e - 1);
const fxBrightFromByte = b => b % 30 === 0 ? b / 30 + 1 : ({ 16: 1, 128: 5, 230: 9, 255: 10 })[b] ?? 5;

/* =========================================================
   Transport
   ========================================================= */
let mdev = null, ms = null, msWait = null, msBusy = false;

async function msSend(p) {
  addLog('tx', p, 'ms');
  for (let i = 0; i < 5; i++) { // the official app also retries 5 times
    const reply = new Promise(res => { msWait = { p, res }; setTimeout(() => res(null), 250); });
    if (demo) msDemoReply(p); else await mdev.sendReport(MS_REPORT, p);
    const r = await reply; msWait = null;
    if (r) return r;
  }
  throw new Error('The mouse did not answer.');
}
function msHandle(r) {
  addLog('rx', r, 'ms');
  const w = msWait;
  if (!w || r[0] !== w.p[0]) return;
  // reads must echo cmd, status 0, address and length; other commands echo cmd and address (status 0 or 1)
  const ok = w.p[0] === MS_CMD.READ ? [1, 2, 3, 4].every(i => r[i] === w.p[i]) : r[1] <= 1 && r[2] === w.p[2];
  if (ok) w.res(r);
}
async function msRead(addr, len) {
  const out = [];
  for (let a = addr; a < addr + len; a += 10) {
    const n = Math.min(10, addr + len - a);
    out.push(...(await msSend(msPack(MS_CMD.READ, a, [], n))).slice(5, 5 + n));
  }
  return out;
}
// Writes in 10-byte packets, like the driver's cl().
async function msWrite(addr, data) {
  for (let i = 0; i < data.length; i += 10) await msSend(msPack(MS_CMD.WRITE, addr + i, data.slice(i, i + 10)));
}

async function msReadBattery() {
  const r = await msSend(msPack(MS_CMD.BATTERY));
  ms.battery = { level: r[9] === 1 ? r[10] : r[5], charging: r[6] === 1, at: Date.now() };
}
async function msReadSettings() {
  const on = await msSend(msPack(MS_CMD.ONLINE));
  ms.online = on[5] === 1;
  if (ms.online) {
    const f = await msRead(0, MS_READ_LEN), at = (a, n) => f.slice(a, a + n);
    Object.assign(ms, {
      rate: f[MS_ADDR.RATE], stages: f[MS_ADDR.STAGES], current: f[MS_ADDR.CURRENT], lod: f[MS_ADDR.LOD],
      debounce: f[MS_ADDR.DEBOUNCE], motionSync: f[MS_ADDR.MOTION_SYNC] === 1, sleep: f[MS_ADDR.SLEEP],
      angle: f[MS_ADDR.ANGLE] === 1, ripple: f[MS_ADDR.RIPPLE] === 1,
      dpis: Array.from({ length: 8 }, (_, i) => dpiDecode(at(MS_ADDR.DPI + i * 4, 4), ms.sensor)),
      dpisY: Array.from({ length: 8 }, (_, i) => dpiDecodeY(at(MS_ADDR.DPI + i * 4, 4), ms.sensor)),
      colors: Array.from({ length: 8 }, (_, i) => at(MS_ADDR.COLOR + i * 4, 3)),
      light: { on: f[MS_ADDR.LIGHT_STATE] === 1, mode: f[MS_ADDR.LIGHT], color: at(MS_ADDR.LIGHT + 1, 3),
        speed: Math.min(9, f[MS_ADDR.LIGHT + 4]), bright: Math.min(9, f[MS_ADDR.LIGHT + 5]), movingOff: f[MS_ADDR.MOVING_OFF] === 1 },
      dpiFx: { on: f[MS_ADDR.DPI_FX_STATE] === 1, mode: f[MS_ADDR.DPI_FX_MODE], bright: fxBrightFromByte(f[MS_ADDR.DPI_FX_BRIGHT]), speed: f[MS_ADDR.DPI_FX_SPEED] },
    });
    ms.keys = [];
    for (let i = 0; i < MS_BUTTONS.length; i++) ms.keys.push(await msReadKey(i, at(MS_ADDR.KEYS + i * 4, 3)));
    try { await msReadBattery(); } catch { ms.battery = null; } // like the official driver, on any connection
  }
  renderMouse();
}
async function msLoad() {
  const h = await msSend(msPack(MS_CMD.HANDSHAKE, 0, [...crypto.getRandomValues(new Uint8Array(4)), 0, 0, 0, 0]));
  const [sensor, cfg] = (h[9] === 7 && Object.entries(MS_SENSORS).find(([, s]) => s.mids.includes(h[10]))) || [];
  ms = { cid: h[9], mid: h[10], link: MS_LINK[h[11]] || ['Unknown', 1000], sensor, cfg, xy: !!cfg?.xy?.includes(h[10]) };
  await msReadSettings();
}

/* Write a partial settings object, using the same records the official driver writes.
   Shared by the page, import and "restore defaults". Values must already be validated. */
async function msWriteSettings(s) {
  if (s.dpis) for (let i = 0; i < s.dpis.length; i++) await msWrite(MS_ADDR.DPI + i * 4, dpiEncode(s.dpis[i], ms.sensor, s.dpisY?.[i] ?? s.dpis[i]));
  if (s.colors) for (let i = 0; i < s.colors.length; i++) await msWrite(MS_ADDR.COLOR + i * 4, msRecord(s.colors[i]));
  for (const [k, a] of [['stages', 'STAGES'], ['current', 'CURRENT'], ['rate', 'RATE'], ['lod', 'LOD'], ['debounce', 'DEBOUNCE'], ['sleep', 'SLEEP']])
    if (s[k] != null) await msWrite(MS_ADDR[a], msPair(s[k]));
  for (const [k, a] of [['motionSync', 'MOTION_SYNC'], ['angle', 'ANGLE'], ['ripple', 'RIPPLE']])
    if (s[k] != null) await msWrite(MS_ADDR[a], msPair(s[k] ? 1 : 0));
  if (s.keys) for (let i = 0; i < s.keys.length; i++) if (s.keys[i]) await msWriteKey(i, s.keys[i]);
  if (s.light) await msWriteLight(s.light);
  if (s.dpiFx) await msWriteDpiFx(s.dpiFx);
}

/* =========================================================
   Connect / disconnect / reconnect
   ========================================================= */
const isMouseInterface = d => d.vendorId === MS_VID && MS_PIDS.includes(d.productId) &&
  d.collections.some(c => c.inputReports.length === 1 && c.outputReports.length === 1 && c.outputReports[0].reportId === MS_REPORT);
const MS_AUTO_KEY = 'od-ms-autoconnect'; // reconnect on load / replug unless the user clicked Disconnect
const msAuto = {
  get() { try { return localStorage.getItem(MS_AUTO_KEY) === '1'; } catch { return false; } },
  set(on) { try { on ? localStorage.setItem(MS_AUTO_KEY, '1') : localStorage.removeItem(MS_AUTO_KEY); } catch {} },
};

function msClosed(note) {
  mdev = null; ms = null; renderMouse(); updateStatus();
  if (note) toast('Mouse disconnected', note, true);
}
let msOpening = false;
async function msOpen(d, silent = false) {
  if (msOpening || ms) return;
  msOpening = true;
  try {
    if (d) {
      if (!d.opened) await d.open();
      mdev = d; d.oninputreport = e => { if (e.reportId === MS_REPORT) msHandle(new Uint8Array(e.data.buffer)); };
    }
    await msLoad();
    updateStatus();
    if (!demo) msAuto.set(true);
    toast(silent ? 'Mouse reconnected' : 'Mouse connected', `${ms.link[0]}${ms.sensor ? `, PAW${ms.sensor} sensor` : ''}.`);
  } catch (e) {
    try { if (mdev) await mdev.close(); } catch {}
    msClosed();
    const blocked = /open/i.test(e.message);
    if (!silent || blocked) // silent attempts stay quiet unless the user can fix something
      toast('Could not connect', blocked ? 'The browser could not open the mouse. Close the Zaopin driver; on Linux, add the udev rule from the README.' : e.message, true);
  } finally { msOpening = false; }
}
async function msConnect() {
  if (ms) { msAuto.set(false); try { if (mdev) await mdev.close(); } catch {} msClosed(); return; }
  if (demo) { await msOpen(null); return; }
  if (!('hid' in navigator)) { toast('WebHID not available', 'Open this page in Chrome or Edge.', true); return; }
  try {
    const picked = await navigator.hid.requestDevice({ filters: MS_PIDS.map(productId => ({ vendorId: MS_VID, productId })) });
    const d = picked.find(isMouseInterface);
    if (d) await msOpen(d);
    else if (picked.length) toast('Could not connect', 'This device has no settings interface OpenDriver knows.', true);
  } catch (e) { toast('Could not connect', e.message, true); }
}
// Reopen a mouse this site was already allowed to use. Called from main.js once everything is loaded.
async function msReconnect() {
  if (demo || !('hid' in navigator) || !msAuto.get() || ms) return;
  try {
    const d = (await navigator.hid.getDevices()).find(isMouseInterface);
    if (d) await msOpen(d, true);
  } catch {}
}

// One change at a time, then read back what the mouse stored.
async function msApply(write, check, okText, failText) {
  if (msBusy) return false;
  msBusy = true;
  try {
    await write();
    await msReadSettings();
    const ok = check();
    if (ok) toast(okText, 'Saved to the mouse.'); else toast('The mouse kept its old setting', typeof failText === 'function' ? failText() : failText, true);
    return ok;
  } catch (e) { toast('Could not update the mouse', e.message, true); renderMouse(); return false; }
  finally { msBusy = false; }
}
async function msRefresh() {
  if (msBusy || !ms) return;
  msBusy = true;
  try { await msReadSettings(); } catch (e) { toast('Could not read the mouse', e.message, true); } finally { msBusy = false; }
}
// While connected: wait for a sleeping mouse to wake up, and refresh the battery once a minute.
setInterval(async () => {
  if (!ms || msBusy || document.hidden) return;
  if (!ms.online) { await msRefresh(); return; }
  if (ms.battery && Date.now() - ms.battery.at > 60000) {
    msBusy = true;
    try { await msReadBattery(); renderMouse(); } catch {} finally { msBusy = false; }
  }
}, 2000);

// The firmware has no "remove stage" command: shift the later stages (DPI and color) up, then lower the count.
function msRemoveStage(i) {
  if (i < 1 || i >= ms.stages) return; // stage 1 can't be removed
  const n = ms.stages, cur = ms.current;
  const dpis = ms.dpis.slice(0, n), dpisY = ms.dpisY.slice(0, n), colors = ms.colors.slice(0, n);
  [dpis, dpisY, colors].forEach(a => a.splice(i, 1));
  const current = cur >= i ? cur - 1 : cur; // keep the same stage active; if it was removed, the one before it
  msApply(async () => {
    for (let j = i; j < n - 1; j++) {
      await msWrite(MS_ADDR.DPI + j * 4, dpiEncode(dpis[j], ms.sensor, dpisY[j]));
      await msWrite(MS_ADDR.COLOR + j * 4, msRecord(colors[j]));
    }
    await msWrite(MS_ADDR.STAGES, msPair(n - 1));
    if (current !== cur) await msWrite(MS_ADDR.CURRENT, msPair(current));
  }, () => ms.stages === n - 1 && ms.current === current && dpis.every((d, j) => ms.dpis[j] === d),
  `Stage ${i + 1} removed.`, 'Some stages did not change. The list shows what the mouse stored.');
}

// Nearest DPI the sensor can store.
function msSnap(v, fallback) {
  if (!Number.isFinite(v)) return fallback;
  v = Math.min(ms.cfg.max, Math.max(50, v));
  if (ms.sensor === '3311' && v > 10000) return Math.min(ms.cfg.max, Math.max(10100, Math.round(v / 100) * 100));
  return Math.min(ms.cfg.max, Math.round(v / 50) * 50);
}

/* =========================================================
   Page
   ========================================================= */
const msEl = (tag, props = {}) => Object.assign(document.createElement(tag), props);
function msSelect(sel, options, value, unknownLabel) {
  const opts = options.map(([v, label]) => new Option(label, v, false, v === value));
  if (!options.some(([v]) => v === value)) opts.unshift(Object.assign(new Option(unknownLabel(value), value, false, true), { disabled: true }));
  sel.replaceChildren(...opts);
}

// Mouse summary card on the Overview page.
function renderMsOverview() {
  const on = !!ms?.online;
  $('ovMsTitle').textContent = ms ? `Mouse${ms.sensor ? ` · PAW${ms.sensor}` : ''}` : 'Mouse';
  $('ovMsSub').textContent = !ms ? 'Have a Zaopin Z2 or Z4D? Connect it to change DPI, buttons and lighting.'
    : on ? `${ms.link[0]} · stage ${ms.current + 1} of ${ms.stages} active.` : 'Connected, but asleep. Move the mouse to wake it.';
  $('ovMsBtn').textContent = ms ? 'Mouse settings' : 'Connect mouse';
  $('ovMsStats').hidden = !on;
  if (!on) return;
  const dpi = ms.dpis[ms.current], y = ms.dpisY[ms.current];
  $('ovMsBattery').textContent = ms.battery ? `${ms.battery.level}%${ms.battery.charging ? ' ⚡' : ''}` : '—';
  $('ovMsDpi').textContent = ms.cfg ? (dpi === y ? String(dpi) : `${dpi} × ${y}`) : '—';
  $('ovMsRate').textContent = `${MS_RATES.find(r => r[1] === ms.rate)?.[0] ?? '?'} Hz`;
}

function renderMouse() {
  renderMsOverview();
  $('msEmpty').hidden = !!ms; $('msContent').hidden = !ms;
  $('msSensorHead').textContent = ms?.sensor ? `PAW${ms.sensor} sensor` : ms ? 'Unknown sensor' : 'Zaopin mouse';
  if (!ms) return;
  const info = [['Connection', ms.link[0]], ['Sensor', ms.sensor ? `PAW${ms.sensor}` : 'Unknown'], ['Model id', `${ms.cid}.${ms.mid}`]];
  if (ms.online && ms.battery) info.push(['Battery', `${ms.battery.level}%${ms.battery.charging ? ', charging' : ''}`]);
  $('msInfo').replaceChildren(...info.flatMap(([k, v]) => [msEl('dt', { textContent: k }), msEl('dd', { textContent: v })]));
  $('msOffline').hidden = ms.online;
  document.querySelectorAll('.ms-online').forEach(el => el.hidden = !ms.online);
  $('msExport').disabled = !ms.online; $('msImport').disabled = !ms.online;
  if (!ms.online) return;

  msSelect($('msRate'), MS_RATES.filter(([hz]) => hz <= ms.link[1]).map(([hz, v]) => [v, `${hz} Hz`]), ms.rate, v => `Other (${v})`);
  msSelect($('msDebounce'), Array.from({ length: MS_DEBOUNCE_MAX + 1 }, (_, v) => [v, `${v} ms`]), ms.debounce, v => `${v} ms`);
  $('msDebounceHint').textContent = ms.debounce < MS_DEBOUNCE_TIP ? `Below ${MS_DEBOUNCE_TIP} ms a button can double-click. If it does, raise this.` : 'Waits this long before a click counts, to filter switch bounce.';
  msSelect($('msSleep'), MS_SLEEP, ms.sleep, v => `${v * 10} s`);
  $('msMotionSync').checked = ms.motionSync;
  $('msAngle').checked = ms.angle;
  $('msRipple').checked = ms.ripple;
  $('msMotionSyncRow').hidden = ms.sensor === '3311'; // sensor.json: motion sync on 3395 / 3950 only

  const lods = MS_LOD[ms.sensor] || MS_LOD.general;
  $('msLod').replaceChildren(...lods.map(([v, label]) => {
    const b = msEl('button', { textContent: label });
    b.setAttribute('aria-pressed', v === ms.lod);
    b.onclick = () => msApply(() => msWrite(MS_ADDR.LOD, msPair(v)), () => ms.lod === v, `Lift-off distance is now ${label}.`, 'Lift-off distance did not change.');
    return b;
  }));

  renderMsButtons();
  renderMsLighting();
  renderMsDpi();
}

function renderMsDpi() {
  msSelect($('msStages'), [1, 2, 3, 4, 5, 6, 7, 8].map(n => [n, String(n)]), ms.stages, v => String(v));
  const editable = !!ms.cfg;
  $('msDpiHint').textContent = !editable ? 'DPI editing is not supported for this model yet.'
    : (ms.sensor === '3311' ? `50 to ${ms.cfg.max} DPI: steps of 50 up to 10000, then 100.` : `50 to ${ms.cfg.max} DPI, in steps of 50.`)
      + (ms.xy ? ' Left box X, right box Y.' : '') + ' Click a stage to make it active.';
  $('msDpis').replaceChildren(...ms.dpis.slice(0, ms.stages).map((dpi, i) => {
    const row = msEl('div', { className: 'field-row ms-dpi-row' });
    const use = msEl('button', { className: 'btn btn-sm ' + (i === ms.current ? 'btn-primary' : 'btn-outline'), textContent: `Stage ${i + 1}` });
    use.setAttribute('aria-pressed', i === ms.current);
    use.onclick = () => msApply(() => msWrite(MS_ADDR.CURRENT, msPair(i)), () => ms.current === i, `Stage ${i + 1} is now active.`, 'The active stage did not change.');
    const color = msEl('input', { type: 'color', value: toHex(ms.colors[i]), className: 'ms-color' });
    color.setAttribute('aria-label', `Stage ${i + 1} indicator color`);
    color.onchange = () => {
      const c = fromHex(color.value);
      msApply(() => msWrite(MS_ADDR.COLOR + i * 4, msRecord(c)), () => toHex(ms.colors[i]) === color.value, `Stage ${i + 1} color updated.`, `Stage ${i + 1} kept its color.`);
    };
    const num = (value, label) => {
      const el = msEl('input', { className: 'input', type: 'number', step: 50, min: 50, max: ms.cfg?.max ?? 0, value: editable ? value : '', disabled: !editable });
      el.style.maxWidth = ms.xy ? '96px' : '120px'; el.setAttribute('aria-label', label);
      return el;
    };
    const x = num(dpi, `Stage ${i + 1} ${ms.xy ? 'X ' : ''}DPI`), y = ms.xy ? num(ms.dpisY[i], `Stage ${i + 1} Y DPI`) : null;
    const save = () => {
      const vx = msSnap(x.valueAsNumber, dpi), vy = y ? msSnap(y.valueAsNumber, ms.dpisY[i]) : vx;
      const text = vx === vy ? `${vx} DPI` : `${vx} × ${vy} DPI`;
      msApply(() => msWrite(MS_ADDR.DPI + i * 4, dpiEncode(vx, ms.sensor, vy)), () => ms.dpis[i] === vx && ms.dpisY[i] === vy,
        `Stage ${i + 1} is now ${text}.`, `Stage ${i + 1} is still ${ms.dpis[i]} DPI.`);
    };
    x.onchange = save; if (y) y.onchange = save;
    const right = msEl('div', { className: 'ms-dpi-edit' });
    right.append(color, x, ...(y ? [y] : []));
    if (editable) {
      const rm = msEl('button', { className: 'btn btn-outline btn-sm', textContent: 'Remove' });
      if (i > 0) { rm.setAttribute('aria-label', `Remove stage ${i + 1}`); rm.onclick = () => msRemoveStage(i); }
      else rm.style.visibility = 'hidden'; // stage 1 always stays; placeholder keeps the inputs aligned
      right.append(rm);
    }
    row.append(use, right);
    return row;
  }));
}

$('msConnectBtn').onclick = msConnect;
$('msDisconnect').onclick = msConnect;
$('msRefresh').onclick = msRefresh;
$('msRate').onchange = e => {
  const v = +e.target.value, hz = MS_RATES.find(r => r[1] === v)[0];
  msApply(() => msWrite(MS_ADDR.RATE, msPair(v)), () => ms.rate === v, `Polling rate is now ${hz} Hz.`, 'Polling rate did not change.');
};
$('msStages').onchange = e => {
  const n = +e.target.value;
  msApply(() => msWrite(MS_ADDR.STAGES, msPair(n)), () => ms.stages === n, `The mouse now has ${n} DPI stage${n === 1 ? '' : 's'}.`, 'Stage count did not change.');
};
$('msDebounce').onchange = e => {
  const v = +e.target.value;
  msApply(() => msWrite(MS_ADDR.DEBOUNCE, msPair(v)), () => ms.debounce === v, `Debounce is now ${v} ms.`, 'Debounce did not change.');
};
$('msSleep').onchange = e => {
  const v = +e.target.value, label = MS_SLEEP.find(s => s[0] === v)[1];
  msApply(() => msWrite(MS_ADDR.SLEEP, msPair(v)), () => ms.sleep === v, `The mouse now sleeps after ${label}.`, 'Sleep time did not change.');
};
for (const [id, key, addr, name] of [['msMotionSync', 'motionSync', 'MOTION_SYNC', 'Motion sync'], ['msAngle', 'angle', 'ANGLE', 'Angle snapping'], ['msRipple', 'ripple', 'RIPPLE', 'Ripple control']])
  $(id).onchange = e => {
    const on = e.target.checked;
    msApply(() => msWrite(MS_ADDR[addr], msPair(on ? 1 : 0)), () => ms[key] === on, `${name} is ${on ? 'on' : 'off'}.`, `${name} did not change.`);
  };
if ('hid' in navigator) {
  navigator.hid.addEventListener('disconnect', e => { if (e.device === mdev) msClosed('Plug it back in: it reconnects automatically.'); });
  navigator.hid.addEventListener('connect', e => { if (isMouseInterface(e.device)) msReconnect(); });
}
