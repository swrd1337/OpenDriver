// OpenDriver · mouse.js
// Zaopin Z2 / Z4D mice (CompX vendor protocol): DPI stages, polling rate, lift-off distance.
// Separate from the keyboard: its own device, packets and page. See docs/MOUSE-PROTOCOL.md.

/* =========================================================
   Protocol
   ========================================================= */
const MS_VID = 0x3554, MS_REPORT = 8;
// wireless and wired product ids, from the official Zaopin driver's cfg.json
const MS_PIDS = [0xF524, 0xF50D, 0xF527, 0xF5D5, 0xF517, 0xF526, 0xF50F, 0xF511, 0xF515];
const MS_CMD = { HANDSHAKE: 1, ONLINE: 3, WRITE: 7, READ: 8 };
const MS_ADDR = { RATE: 0, STAGES: 2, CURRENT: 4, LOD: 10, DPI: 12 };
const MS_RATES = [[125, 8], [250, 4], [500, 2], [1000, 1], [2000, 16], [4000, 32], [8000, 64]]; // [Hz, stored value]
const MS_LINK = { 0: ['Wireless', 1000], 1: ['Wireless', 4000], 2: ['Wired', 1000], 3: ['Wired', 8000], 4: ['Wireless', 2000], 5: ['Wireless', 8000] };
// Zaopin is cid 7; the model id picks the sensor (cfg.json). Only range-coded sensors are editable here.
const MS_SENSORS = { 3395: { max: 26000, mids: [1, 2, 3, 7, 10, 11, 12, 13] }, 3950: { max: 30000, mids: [4, 5, 6, 8, 14, 15, 16] }, 3311: { max: 12000, mids: [9], noDpi: true } };
const MS_LOD = { general: [[1, '1 mm'], [2, '2 mm']], 3950: [[3, '0.7 mm'], [1, '1 mm'], [2, '2 mm']] };

// 16-byte report 8. Byte 15 makes the sum of all bytes plus the report id equal 0x55.
function msPack(cmd, addr = 0, data = [], len = data.length) {
  const p = new Uint8Array(16);
  p[0] = cmd; p[2] = addr >> 8; p[3] = addr & 255; p[4] = len; p.set(data, 5);
  p[15] = 85 - p.slice(0, 15).reduce((a, b) => a + b, 0) - MS_REPORT; // Uint8Array wraps mod 256
  return p;
}
// A flash setting is stored as [value, 0x55 - value].
const msPair = v => [v, 85 - v & 255];
// DPI stage (3395 / 3950, base range): [x, y, high bits, check]; value = dpi / 50 - 1.
function dpiEncode(dpi) {
  const v = dpi / 50 - 1, h = v >> 8, b = [v & 255, v & 255, (h << 2 | h << 6) & 255];
  return [...b, 85 - b[0] - b[1] - b[2] & 255];
}
const dpiDecode = b => ((b[0] | (b[2] >> 2 & 3) << 8) + 1) * 50 * (b[2] & 1 ? 2 : 1);

/* =========================================================
   Transport
   ========================================================= */
let mdev = null, ms = null, msWait = null, msBusy = false;

async function msSend(p) {
  addLog('tx', p);
  for (let i = 0; i < 5; i++) { // the official app also retries 5 times
    const reply = new Promise(res => { msWait = { p, res }; setTimeout(() => res(null), 250); });
    if (demo) msDemoReply(p); else await mdev.sendReport(MS_REPORT, p);
    const r = await reply; msWait = null;
    if (r) return r;
  }
  throw new Error('The mouse did not answer.');
}
function msHandle(r) {
  addLog('rx', r);
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
const msWrite = (addr, data) => msSend(msPack(MS_CMD.WRITE, addr, data));

async function msReadSettings() {
  const on = await msSend(msPack(MS_CMD.ONLINE));
  ms.online = on[5] === 1;
  if (ms.online) {
    const f = await msRead(0, 44);
    Object.assign(ms, { rate: f[MS_ADDR.RATE], stages: f[MS_ADDR.STAGES], current: f[MS_ADDR.CURRENT], lod: f[MS_ADDR.LOD] });
    ms.dpis = Array.from({ length: 8 }, (_, i) => dpiDecode(f.slice(MS_ADDR.DPI + i * 4, MS_ADDR.DPI + i * 4 + 4)));
  }
  renderMouse();
}
async function msLoad() {
  const h = await msSend(msPack(MS_CMD.HANDSHAKE, 0, [...crypto.getRandomValues(new Uint8Array(4)), 0, 0, 0, 0]));
  const [sensor, cfg] = (h[9] === 7 && Object.entries(MS_SENSORS).find(([, s]) => s.mids.includes(h[10]))) || [];
  ms = { cid: h[9], mid: h[10], link: MS_LINK[h[11]] || ['Unknown', 1000], sensor, cfg };
  await msReadSettings();
}

/* =========================================================
   Connect / disconnect
   ========================================================= */
const isMouseInterface = d => d.vendorId === MS_VID && MS_PIDS.includes(d.productId) &&
  d.collections.some(c => c.inputReports.length === 1 && c.outputReports.length === 1 && c.outputReports[0].reportId === MS_REPORT);

function msClosed(note) {
  mdev = null; ms = null; renderMouse();
  if (note) toast('Mouse disconnected', note, true);
}
async function msConnect() {
  if (ms) { try { if (mdev) await mdev.close(); } catch {} msClosed(); return; }
  try {
    if (!demo) {
      if (!('hid' in navigator)) { toast('WebHID not available', 'Open this page in Chrome or Edge.', true); return; }
      const picked = await navigator.hid.requestDevice({ filters: MS_PIDS.map(productId => ({ vendorId: MS_VID, productId })) });
      const d = picked.find(isMouseInterface);
      if (!d) { if (picked.length) toast('Could not connect', 'This device has no settings interface OpenDriver knows.', true); return; }
      if (!d.opened) await d.open();
      mdev = d; d.oninputreport = e => { if (e.reportId === MS_REPORT) msHandle(new Uint8Array(e.data.buffer)); };
    }
    await msLoad();
    toast('Mouse connected', `${ms.link[0]}${ms.sensor ? `, PAW${ms.sensor} sensor` : ''}.`);
  } catch (e) {
    try { if (mdev) await mdev.close(); } catch {}
    msClosed();
    toast('Could not connect', /open/i.test(e.message)
      ? 'The browser could not open the mouse. Close the Zaopin driver; on Linux, add the udev rule from the README.'
      : e.message, true);
  }
}

// One change at a time, then read back what the mouse stored.
async function msApply(write, check, okText, failText) {
  if (msBusy) return;
  msBusy = true;
  try {
    await write();
    await msReadSettings();
    if (check()) toast(okText, 'Saved to the mouse.'); else toast('The mouse kept its old setting', failText, true);
  } catch (e) { toast('Could not update the mouse', e.message, true); renderMouse(); }
  finally { msBusy = false; }
}

// The firmware has no "remove stage" command: shift the later stages up, then lower the count.
// shortcut: stage colors (address 44+) don't move with their stage; shift them too once colors are editable.
function msRemoveStage(i) {
  if (i < 1 || i >= ms.stages) return; // stage 1 can't be removed
  const n = ms.stages, cur = ms.current, dpis = ms.dpis.slice(0, n);
  dpis.splice(i, 1);
  const current = cur >= i ? cur - 1 : cur; // keep the same stage active; if it was removed, the one before it
  msApply(async () => {
    for (let j = i; j < n - 1; j++) await msWrite(MS_ADDR.DPI + j * 4, dpiEncode(dpis[j]));
    await msWrite(MS_ADDR.STAGES, msPair(n - 1));
    if (current !== cur) await msWrite(MS_ADDR.CURRENT, msPair(current));
  }, () => ms.stages === n - 1 && ms.current === current && dpis.every((d, j) => ms.dpis[j] === d),
  `Stage ${i + 1} removed.`, 'Some stages did not change. The list shows what the mouse stored.');
}

/* =========================================================
   Page
   ========================================================= */
function renderMouse() {
  $('msEmpty').hidden = !!ms; $('msContent').hidden = !ms;
  if (!ms) return;
  const info = [['Connection', ms.link[0]], ['Sensor', ms.sensor ? `PAW${ms.sensor}` : 'Unknown'], ['Model id', `${ms.cid}.${ms.mid}`]];
  $('msInfo').replaceChildren(...info.flatMap(([k, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; return [dt, dd]; }));
  $('msOffline').hidden = ms.online; $('msSettings').hidden = !ms.online;
  if (!ms.online) return;

  const rate = $('msRate');
  rate.replaceChildren(...MS_RATES.filter(([hz]) => hz <= ms.link[1]).map(([hz, v]) => new Option(`${hz} Hz`, v, false, v === ms.rate)));

  const lods = MS_LOD[ms.sensor] || MS_LOD.general;
  $('msLod').replaceChildren(...lods.map(([v, label]) => {
    const b = document.createElement('button'); b.textContent = label; b.setAttribute('aria-pressed', v === ms.lod);
    b.onclick = () => msApply(() => msWrite(MS_ADDR.LOD, msPair(v)), () => ms.lod === v, `Lift-off distance is now ${label}.`, 'Lift-off distance did not change.');
    return b;
  }));

  const stages = $('msStages');
  stages.replaceChildren(...[1, 2, 3, 4, 5, 6, 7, 8].map(n => new Option(n, n, false, n === ms.stages)));

  const editable = ms.cfg && !ms.cfg.noDpi;
  $('msDpiHint').textContent = editable ? `50 to ${ms.cfg.max} DPI, in steps of 50. Click a stage to make it active.` : 'DPI editing is not supported for this sensor yet.';
  $('msDpis').replaceChildren(...ms.dpis.slice(0, ms.stages).map((dpi, i) => {
    const row = document.createElement('div'); row.className = 'field-row';
    const use = document.createElement('button');
    use.className = 'btn btn-sm ' + (i === ms.current ? 'btn-primary' : 'btn-outline');
    use.textContent = `Stage ${i + 1}`; use.setAttribute('aria-pressed', i === ms.current);
    use.onclick = () => msApply(() => msWrite(MS_ADDR.CURRENT, msPair(i)), () => ms.current === i, `Stage ${i + 1} is now active.`, 'The active stage did not change.');
    const input = document.createElement('input');
    Object.assign(input, { className: 'input', type: 'number', step: 50, min: 50, max: ms.cfg?.max ?? 0, value: editable ? dpi : '', disabled: !editable });
    input.style.maxWidth = '140px'; input.setAttribute('aria-label', `Stage ${i + 1} DPI`);
    input.onchange = () => {
      const v = Math.min(ms.cfg.max, Math.max(50, Math.round(input.valueAsNumber / 50) * 50 || dpi));
      msApply(() => msWrite(MS_ADDR.DPI + i * 4, dpiEncode(v)), () => ms.dpis[i] === v, `Stage ${i + 1} is now ${v} DPI.`, `Stage ${i + 1} is still ${ms.dpis[i]} DPI.`);
    };
    const right = document.createElement('div'); right.style.cssText = 'display:flex;gap:8px;align-items:center';
    right.append(input);
    if (editable) {
      const rm = document.createElement('button');
      rm.className = 'btn btn-outline btn-sm'; rm.textContent = 'Remove';
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
$('msRefresh').onclick = async () => {
  if (msBusy) return;
  msBusy = true;
  try { await msReadSettings(); } catch (e) { toast('Could not read the mouse', e.message, true); } finally { msBusy = false; }
};
$('msRate').onchange = e => {
  const v = +e.target.value, hz = MS_RATES.find(r => r[1] === v)[0];
  msApply(() => msWrite(MS_ADDR.RATE, msPair(v)), () => ms.rate === v, `Polling rate is now ${hz} Hz.`, 'Polling rate did not change.');
};
$('msStages').onchange = e => {
  const n = +e.target.value;
  msApply(() => msWrite(MS_ADDR.STAGES, msPair(n)), () => ms.stages === n, `The mouse now has ${n} DPI stage${n === 1 ? '' : 's'}.`, 'Stage count did not change.');
};
if ('hid' in navigator) navigator.hid.addEventListener('disconnect', e => { if (e.device === mdev) msClosed('Plug it back in, then click Connect mouse.'); });
