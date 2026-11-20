// OpenDriver · demo.js
// Fake keyboard for ?demo, so the UI can be tried without hardware.

/* =========================================================
   Demo device: open with ?demo to preview the UI without a keyboard
   ========================================================= */
const demoLight = { colors: [[255,59,48],[255,149,0],[255,214,10],[52,199,89],[0,199,190],[10,132,255],[255,55,95]], on: true, dir: false, superResp: false, lum: 3, mode: 0, speed: 2, sleep: 5, staticMode: 5 };
function demoReply(p) {
  if (p[2] === CMD.RM) {
    const r = new Uint8Array(192); r[0] = HEAD; r[1] = 188; r[2] = CMD.RM + 0x80;
    const n = r.subarray(4); n[1] = p[4];
    const t = performance.now() / 1000, phase = { 26: 0, 4: 1.6, 22: 3.1, 7: 4.7 }; // W A S D
    for (let i = 0; i < 3; i++) for (let j = 0; j < 21; j++) {
      const row = (p[5] - 1) * 3 + i, code = DEFAULT_ROWS[row - 1]?.[j];
      const v = code in phase ? Math.round(Math.max(0, Math.sin(t * 2.2 + phase[code])) ** 2 * 3400) : 0;
      n[2 + (i * 21 + j) * 2] = v & 0xff; n[3 + (i * 21 + j) * 2] = v >> 8;
    }
    setTimeout(() => handle(r), 5); return;
  }
  const r = new Uint8Array(64); r[0] = HEAD; r[2] = p[2] + 0x80; r[1] = 60;
  const n = new Uint8Array(60), enc = s => new TextEncoder().encode(s);
  if (p[2] === CMD.SYNC) { n.set(enc('DEMO000000000000'), 9); n.set(enc('App V1.0.0'), 26); n.set(enc('Dec 31 2024'), 43); n[1] = 1; }
  else if (p[2] === CMD.CMD) { n[1] = p[4]; if (p[4] === 0x11) seedDemoKeymap(); if (p[4] === 0x50) { if (p[5] !== 7) demoRate = p[5]; n[2] = demoRate; } if (p[4] === 38) n.set(enc('AK680 MAX (demo)'), 2); if (p[4] === 1) { n[2] = 0x08; n[3] = 1; } if (p[4] === 37) { n[2] = 10; n.set([100, 0, 0x0c, 0x0e], 3); } }
  else if (p[2] === CMD.DB) {
    if (p[4] === 1) demoDB = [p[7] | p[8] << 8, p[9] | p[10] << 8, p[11] | p[12] << 8];
    [n[3], n[4], n[5], n[6], n[7], n[8]] = [demoDB[0] & 0xff, demoDB[0] >> 8, demoDB[1] & 0xff, demoDB[1] >> 8, demoDB[2] & 0xff, demoDB[2] >> 8];
  }
  else if (p[2] === CMD.PRGB) {
    const q = p.slice(4);
    if (q[0] === 1) { demoLight.colors = [0,1,2,3,4,5,6].map(i => [q[5+i*4+2], q[5+i*4+1], q[5+i*4]]); Object.assign(demoLight, { on: !!(q[37]&1), dir: !!(q[37]&2), lum: q[38], mode: q[39], speed: q[40], sleep: q[41], staticMode: q[42] }); }
    n.set(prgbPack(0, demoLight).slice(4, 47));
  }
  else if (p[2] === CMD.DEFKEY) {
    // demo matrix: row 0 empty (no F-row on a 65% board), rows 1-5 = DEFAULT_ROWS
    const rowCodes = row => (row >= 1 && row <= 5 ? DEFAULT_ROWS[row - 1] : []);
    n[1] = p[5]; rowCodes(p[5]).forEach((c, i) => n[2 + i] = c);
    n[23] = p[6]; rowCodes(p[6]).forEach((c, i) => n[24 + i] = c);
  }
  else if (p[2] === CMD.KEY) {
    const q = p.slice(4); n[0] = q[0];
    for (let i = 1; i < 57; i += 4) {
      const key = q[i], ly = q[i + 1];
      n[i] = key; n[i + 1] = ly;
      if (!key || key === 0xff) continue;
      const store = ly <= 3 ? demoKeymap[ly] : PERF_LAYER[ly] ? demoPerf[PERF_LAYER[ly]] : null;
      if (!store) continue;
      if (q[0] === 1) store.set(key, q[i + 2] | q[i + 3] << 8);
      const v = store.get(key) ?? (ly <= 3 ? layerDefault(ly, key) : DEMO_PERF_DEFAULT[PERF_LAYER[ly]]);
      n[i + 2] = v & 0xff; n[i + 3] = v >> 8 & 0xff;
    }
  }
  else if (p[2] === CMD.KRGB) {
    const q = p.slice(4); n[0] = q[0];
    for (let i = 1; i < 57; i += 4) {
      const key = q[i];
      if (key === 0xff || key === 0 || i + 3 >= p[1]) { n.fill(0xff, i, i + 4); continue; }
      if (q[0] === 1) demoColors.set(key, [q[i + 1], q[i + 2], q[i + 3]]);
      const c = demoColors.get(key) ?? [255, 255, 255];
      n[i] = key; n[i + 1] = c[0]; n[i + 2] = c[1]; n[i + 3] = c[2];
    }
  }
  r.set(n, 4); setTimeout(() => handle(r), 5);
}
const demoColors = new Map();
let demoDB = [1500, 200, 200], demoRate = 8; // 1.50 mm, 0.20 / 0.20 mm deadzones, 1000 Hz
const demoPerf = { mode: new Map(), db0: new Map(), rtp: new Map(), rtr: new Map() };
const DEMO_PERF_DEFAULT = { mode: 0, db0: 1500, rtp: 300, rtr: 300 };
const demoKeymap = [new Map(), new Map(), new Map(), new Map()];
function seedDemoKeymap() { // demo "factory" state: F1-F12 on layer 2
  demoKeymap.forEach(m => m.clear());
  [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 45, 46].forEach((c, i) => demoKeymap[1].set(c, 58 + i));
}
seedDemoKeymap();
demoKeymap[0].set(57, 41); // demo: Caps Lock -> Esc, so there is something to reset

// Demo mouse: a 3950-sensor Z4D on a 4K dongle, answering from a fake settings flash.
let demoMsFlash = null; // built on first use: dpiEncode lives in mouse.js, which loads later
function demoMsInit() {
  demoMsFlash = new Uint8Array(256).fill(255);
  [[0, 1], [2, 6], [4, 1], [10, 1]].forEach(([a, v]) => demoMsFlash.set([v, 85 - v & 255], a)); // 1000 Hz, 6 stages, stage 2, 1 mm
  [400, 800, 1600, 2400, 3200, 6400, 800, 800].forEach((d, i) => demoMsFlash.set(dpiEncode(d), 12 + i * 4));
}
function msDemoReply(p) {
  if (!demoMsFlash) demoMsInit();
  const r = p.slice(); r[1] = 0;
  if (p[0] === MS_CMD.HANDSHAKE) { r[9] = 7; r[10] = 4; r[11] = 1; }
  else if (p[0] === MS_CMD.ONLINE) r[5] = 1;
  else if (p[0] === MS_CMD.READ) r.set(demoMsFlash.slice(p[2] << 8 | p[3], (p[2] << 8 | p[3]) + p[4]), 5);
  else if (p[0] === MS_CMD.WRITE) demoMsFlash.set(p.slice(5, 5 + p[4]), p[2] << 8 | p[3]);
  setTimeout(() => msHandle(r), 5);
}
