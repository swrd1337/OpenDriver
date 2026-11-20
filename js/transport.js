// OpenDriver · transport.js
// WebHID send/receive, reply parsing, and the read-everything flow on connect.

/* =========================================================
   Transport
   ========================================================= */
async function send(p, gap = 30) {
  if (p[2] !== CMD.RM) addLog('tx', p.slice(0, 4 + p[1])); // live travel polling is too chatty to log
  if (demo) { demoReply(p); await wait(Math.min(gap, 20)); return; }
  await dev.sendReport(0, p);
  await wait(gap);
}
function onInput(e) {
  const d = new Uint8Array(e.data.buffer);
  const m = new Uint8Array(rx.length + d.length); m.set(rx); m.set(d, rx.length); rx = m;
  if (rx[2] === 146) rx[1] = 192; // same quirk as the official app
  if (rx[1] <= rx.length) { handle(rx); rx = new Uint8Array(0); }
}
function handle(buf) {
  const cmd = buf[2], n = buf.slice(4);
  if (cmd === CMD.RM + 0x80) { onTravelReply(n); return; }
  addLog('rx', buf.slice(0, Math.min(buf.length, 4 + buf[1])));
  if (cmd === CMD.SYNC + 0x80) {
    info.board = new DataView(n.slice(1, 5).buffer).getUint32(0, true);
    info.keyType = n[3];
    info.mode = n[7] === 255 ? 'Bootloader' : 'Application';
    info.serial = txt(n.slice(9, 25));
    info.firmware = txt(n.slice(26, 36));
    info.build = txt(n.slice(43, 54));
  } else if (cmd === CMD.CMD + 0x80) {
    if (n[1] === 38) info.name = txt(n.slice(2, 34));
    if (n[1] === 0x50) { info.rate = [1, 2, 4, 8, 16, 32, 64].indexOf(n[2]); renderPerf(); } // index into rateList()
    if (n[1] === 1) info.protocol = `${n[3] & 15}.${n[2] >> 4 & 15}.${n[2] & 15}`;
    if (n[1] === 37) {
      info.precision = n[2] / 1000;
      info.travel = [(n[4] << 8 | n[3]) / 1000, (n[6] << 8 | n[5]) / 1000];
    }
  } else if (cmd === CMD.DB + 0x80) {
    info.actuation = (n[4] << 8 | n[3]) / 1000;
    info.pressDead = (n[6] << 8 | n[5]) / 1000;
    info.releaseDead = (n[8] << 8 | n[7]) / 1000;
    renderPerf();
  } else if (cmd === CMD.DEFKEY + 0x80) {
    for (const [ri, off] of [[1, 2], [23, 24]]) {
      const row = n[ri];
      if (row > 7) continue;
      matrixRows[row] = [];
      for (let c = 0; c < 21; c++) if (n[off + c]) matrixRows[row].push({ code: n[off + c], col: c });
    }
    refreshKeyboards(true);
  } else if (cmd === CMD.KEY + 0x80) {
    for (let i = 1; i + 3 < n.length && i < 1 + 14 * 4; i += 4) {
      const key = n[i], layer = n[i + 1], val = n[i + 3] << 8 | n[i + 2];
      if (!key || key === 0xff) continue;
      if (layer <= 3) keymap[layer].set(key, val);
      else if (PERF_LAYER[layer]) perf[PERF_LAYER[layer]].set(key, val);
    }
    refreshKeyboards(false);
  } else if (cmd === CMD.KRGB + 0x80) {
    for (let i = 1; i + 3 < n.length && i < 1 + 14 * 4; i += 4) {
      const key = n[i];
      if (!key || key >= 254) continue;
      keyColors.set(key, [n[i + 1], n[i + 2], n[i + 3]]);
    }
    refreshKeyboards(false);
  } else if (cmd === CMD.PRGB + 0x80) {
    if (writePending) return; // a newer local change is queued; don't let a stale read-back overwrite it
    const colors = [];
    for (let i = 0, o = 5; i < 7; i++, o += 4) colors.push([n[o + 2], n[o + 1], n[o]]);
    const f = n[37];
    light = { colors, on: !!(f & 1), dir: !!(f & 2), superResp: !!(f & 16), lum: n[38], mode: n[39], speed: n[40], sleep: n[41], staticMode: n[42] };
    renderLighting();
  }
  renderInfo();
}

async function readAll() {
  await send(syncPack()); await wait(200);
  await send(cmdPack(1)); await send(cmdPack(38)); await send(cmdPack(37));
  await send(dbReadPack());
  await send(prgbPack(0, { colors: Array(7).fill([0, 0, 0]), on: false, dir: false, superResp: false, lum: 0, mode: 0, speed: 0, sleep: 0, staticMode: 0 }));
  matrixRows = [];
  await send(defkeyPack(0, 1)); await send(defkeyPack(2, 3)); await send(defkeyPack(4, 5));
  await wait(150);
  await readKeymap();
  await readColors();
  await readPerf();
}
async function readPerf(keys = layoutRows().flat()) {
  await send(cmdPack(0x50, 7));
  for (const ly of [L.MODE, L.DB0, L.RTP, L.RTR])
    for (let i = 0; i < keys.length; i += 14) await send(keyPack(false, keys.slice(i, i + 14).map(k => [k, ly, 0])), 8);
}
async function readColors() {
  const keys = layoutRows().flat();
  for (let i = 0; i < keys.length; i += 14) await send(krgbPack(false, keys.slice(i, i + 14).map(k => [k, 0, 0, 0])), 8);
  await wait(80);
  savedColors = new Map([...keyColors].map(([k, c]) => [k, c.slice()]));
  ckDirty = false;
  refreshKeyboards(false);
}
async function readKeymap() {
  keymap.forEach(m => m.clear());
  const keys = layoutRows().flat();
  for (let ly = 0; ly < 4; ly++)
    for (let i = 0; i < keys.length; i += 14) await send(keyPack(false, keys.slice(i, i + 14).map(k => [k, ly, 0])), 8);
}

let writeTimer = null, writePending = false;
function writeLight() {
  clearTimeout(writeTimer);
  writePending = true;
  renderLighting();
  writeTimer = setTimeout(async () => {
    try {
      await send(prgbPack(1, light));
      writePending = false;
      await send(prgbPack(0, light));
      toast('Lighting updated', 'Saved to the keyboard.');
    } catch (e) { writePending = false; toast('Could not update lighting', e.message, true); }
  }, 180);
}
