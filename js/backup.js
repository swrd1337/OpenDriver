// OpenDriver · backup.js
// Export / import settings to a JSON file (keyboard and mouse), and "restore defaults" per mouse section.
// Imported files are untrusted: every value is range-checked before anything is written.

/* =========================================================
   Shared helpers
   ========================================================= */
const BACKUP_FORMAT = 1;
function confirmDialog(title, body, okLabel, destructive = true) {
  $('confirmTitle').textContent = title; $('confirmBody').textContent = body;
  const ok = $('confirmOk'); ok.textContent = okLabel; ok.className = 'btn ' + (destructive ? 'btn-destructive' : 'btn-primary');
  return msDialog($('confirmDlg'));
}
function downloadJson(name, data) {
  const a = msEl('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const today = () => new Date().toISOString().slice(0, 10);
function pickJson() {
  return new Promise((res, rej) => {
    const input = msEl('input', { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return res(null);
      if (f.size > 1 << 20) return rej(new Error('That file is too large to be an OpenDriver backup.'));
      try { res(JSON.parse(await f.text())); } catch { rej(new Error('That file is not valid JSON.')); }
    };
    input.click();
  });
}
// Validators: throw with a readable message, return the clean value.
class BadFile extends Error {}
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
function int(v, min, max, what) { if (!isInt(v, min, max)) throw new BadFile(`${what} must be a whole number from ${min} to ${max}.`); return v; }
function bool(v, what) { if (typeof v !== 'boolean') throw new BadFile(`${what} must be true or false.`); return v; }
function oneOf(v, list, what) { if (!list.includes(v)) throw new BadFile(`${what} has a value OpenDriver doesn't know (${JSON.stringify(v)}).`); return v; }
function arr(v, len, what) { if (!Array.isArray(v) || (len != null && v.length !== len)) throw new BadFile(`${what} must be a list${len != null ? ` of ${len}` : ''}.`); return v; }
const rgb = (v, what) => arr(v, 3, what).map((c, i) => int(c, 0, 255, `${what} [${i}]`));
function checkFile(f, kind) {
  if (!f || f.app !== 'OpenDriver' || f.kind !== kind) throw new BadFile(`This is not an OpenDriver ${kind} backup.`);
  if (f.format !== BACKUP_FORMAT) throw new BadFile(`This backup uses format ${f.format}; this version of OpenDriver reads format ${BACKUP_FORMAT}.`);
  if (!f.settings || typeof f.settings !== 'object') throw new BadFile('The backup has no settings.');
  return f.settings;
}

/* =========================================================
   Mouse
   ========================================================= */
function msSnapshot() {
  const pick = ['rate', 'stages', 'current', 'lod', 'debounce', 'motionSync', 'sleep', 'angle', 'ripple', 'dpis', 'dpisY', 'colors', 'light', 'dpiFx'];
  const s = Object.fromEntries(pick.map(k => [k, ms[k]]));
  s.keys = ms.keys.map(k => keyChoice(k) === 'other' ? null : k); // actions OpenDriver can't rebuild are left out
  return JSON.parse(JSON.stringify(s));
}

function msValidKey(k, what) {
  if (k === null) return null;
  if (typeof k !== 'object') throw new BadFile(`${what} must be an object.`);
  const t = int(k.t, 0, 15, `${what} type`);
  if (t === MS_T.FIRE) { const p = int(k.p, 0, 0xFFFF, `${what} fire key`); int(p >> 8, 10, 255, `${what} fire interval`); int(p & 255, 0, 3, `${what} fire clicks`); return { t, p }; }
  if (t === MS_T.DPI_LOCK) return { t, lock: oneOf(k.lock, Array.from({ length: 10 }, (_, j) => (j + 1) * 100), `${what} DPI lock`) };
  if (t === MS_T.SHORTCUT) {
    if (k.media != null) return { t, p: 0, media: oneOf(k.media, MS_MEDIA.map(m => m[0]), `${what} media key`) };
    const sc = arr(k.sc, null, `${what} shortcut`);
    if (!sc.length || sc.length > MS_SHORTCUT_MAX) throw new BadFile(`${what} shortcut must have 1 to ${MS_SHORTCUT_MAX} keys.`);
    return { t, p: 0, sc: sc.map((e, j) => ({ type: oneOf(e?.type, [0, 1], `${what} key ${j + 1} type`),
      value: e.type === 0 ? oneOf(e.value, MS_MODS.map(m => m[0]), `${what} modifier`) : oneOf(e.value, MS_KEYS.map(x => x[0]), `${what} key`) })) };
  }
  if (t === MS_T.MACRO) {
    const repeat = int(k.repeat, 1, 255, `${what} repeat`);
    if (repeat > 250 && repeat < 253) throw new BadFile(`${what} repeat must be 1–250, 253, 254 or 255.`);
    const name = typeof k.mc?.name === 'string' ? k.mc.name : '';
    const len = new TextEncoder().encode(name).length;
    if (!len || len > 30) throw new BadFile(`${what} macro name must be 1 to 30 bytes.`);
    const ev = arr(k.mc.events, null, `${what} macro events`);
    if (!ev.length || ev.length > MS_MACRO_MAX) throw new BadFile(`${what} macro must have 1 to ${MS_MACRO_MAX} events.`);
    return { t, repeat, mc: { name, events: ev.map((e, j) => ({ down: bool(e?.down, `${what} event ${j + 1}`), type: oneOf(e.type, [0, 1, 2, 4], `${what} event ${j + 1} type`),
      value: int(e.value, 0, 0xFFFF, `${what} event ${j + 1} value`), delay: int(e.delay, 0, 0xFFFF, `${what} event ${j + 1} delay`) })) } };
  }
  const p = int(k.p, 0, 0xFFFF, `${what} param`);
  if (!simpleAction({ t, p })) throw new BadFile(`${what} has an action OpenDriver doesn't know.`);
  return { t, p };
}
// Returns only the settings this mouse can take; DPI is checked against the connected sensor.
function msValidate(s) {
  const out = {};
  if ('rate' in s) out.rate = oneOf(s.rate, MS_RATES.filter(([hz]) => hz <= ms.link[1]).map(r => r[1]), 'Polling rate');
  if ('stages' in s) out.stages = int(s.stages, 1, 8, 'Stage count');
  if ('current' in s) out.current = int(s.current, 0, (out.stages ?? ms.stages) - 1, 'Active stage');
  if ('lod' in s) out.lod = oneOf(s.lod, (MS_LOD[ms.sensor] || MS_LOD.general).map(l => l[0]), 'Lift-off distance');
  if ('debounce' in s) out.debounce = int(s.debounce, 0, MS_DEBOUNCE_MAX, 'Debounce');
  if ('sleep' in s) out.sleep = oneOf(s.sleep, MS_SLEEP.map(x => x[0]), 'Sleep time');
  for (const k of ['motionSync', 'angle', 'ripple']) if (k in s) out[k] = bool(s[k], k);
  if ('dpis' in s && ms.cfg) {
    const valid = v => Number.isFinite(v) && msSnap(v, -1) === v;
    out.dpis = arr(s.dpis, 8, 'DPI stages').map((v, i) => { if (!valid(v)) throw new BadFile(`Stage ${i + 1} DPI (${v}) can't be stored by the PAW${ms.sensor}.`); return v; });
    out.dpisY = ms.xy && Array.isArray(s.dpisY) ? arr(s.dpisY, 8, 'Y DPI').map((v, i) => { if (!valid(v)) throw new BadFile(`Stage ${i + 1} Y DPI (${v}) is out of range.`); return v; }) : out.dpis;
  }
  if ('colors' in s) out.colors = arr(s.colors, 8, 'Stage colors').map((c, i) => rgb(c, `Stage ${i + 1} color`));
  if ('keys' in s) {
    out.keys = arr(s.keys, MS_BUTTONS.length, 'Buttons').map((k, i) => msValidKey(k, MS_BUTTONS[i]));
    const after = ms.keys.map((k, i) => out.keys[i] ?? k);
    if (!after.some(isLeft)) throw new BadFile('No button would do Left click. OpenDriver keeps at least one.');
  }
  if ('light' in s) {
    const l = s.light;
    out.light = { on: bool(l?.on, 'Light on'), mode: int(l.mode, 0, 6, 'Light mode'), color: rgb(l.color, 'Light color'),
      speed: int(l.speed, 0, 9, 'Light speed'), bright: int(l.bright, 0, 9, 'Light brightness'), movingOff: bool(l.movingOff, 'Light off while moving') };
  }
  if ('dpiFx' in s) {
    const f = s.dpiFx;
    out.dpiFx = { on: bool(f?.on, 'DPI indicator on'), mode: int(f.mode, 0, 2, 'DPI indicator mode'), bright: int(f.bright, 1, 10, 'DPI indicator brightness'), speed: int(f.speed, 1, 5, 'DPI indicator speed') };
  }
  return out;
}
// Which of the written settings the mouse didn't keep.
function msMismatches(want) {
  const bad = [];
  for (const k of ['rate', 'stages', 'current', 'lod', 'debounce', 'sleep', 'motionSync', 'angle', 'ripple']) if (k in want && want[k] !== ms[k]) bad.push(k);
  if (want.dpis && want.dpis.some((d, i) => d !== ms.dpis[i] || want.dpisY[i] !== ms.dpisY[i])) bad.push('DPI');
  if (want.colors && want.colors.some((c, i) => toHex(c) !== toHex(ms.colors[i]))) bad.push('stage colors');
  if (want.keys && want.keys.some((k, i) => k && !keyEquals(ms.keys[i], k))) bad.push('buttons');
  if (want.light && !lightEquals(ms.light, want.light)) bad.push('lighting');
  if (want.dpiFx && !fxEquals(ms.dpiFx, want.dpiFx)) bad.push('DPI indicator');
  return bad;
}
async function msApplyAll(want, okText) {
  if (want.dpis && !want.dpisY) want.dpisY = want.dpis;
  let bad = [];
  const ok = await msApply(() => msWriteSettings(want), () => !(bad = msMismatches(want)).length, okText,
    () => `Not kept: ${bad.join(', ')}. The page shows what the mouse stored.`);
  return ok;
}

$('msExport').onclick = () => {
  if (!ms?.online) return;
  downloadJson(`opendriver-mouse-${today()}.json`, { app: 'OpenDriver', kind: 'mouse', format: BACKUP_FORMAT, saved: new Date().toISOString(),
    model: { cid: ms.cid, mid: ms.mid, sensor: ms.sensor ?? null }, settings: msSnapshot() });
  toast('Mouse settings exported', 'Saved as a JSON file in your downloads.');
};
$('msImport').onclick = async () => {
  if (!ms?.online || msBusy) return;
  let want;
  try {
    const f = await pickJson();
    if (!f) return;
    want = msValidate(checkFile(f, 'mouse'));
    if (f.model?.sensor !== (ms.sensor ?? null) && want.dpis) toast('Different sensor', `The backup is from a PAW${f.model?.sensor} mouse; DPI values were checked against this PAW${ms.sensor}.`);
  } catch (e) { toast('Could not import', e instanceof BadFile || e.message ? e.message : String(e), true); return; }
  if (!Object.keys(want).length) { toast('Nothing to import', 'The backup has no settings this mouse can take.', true); return; }
  if (!(await confirmDialog('Import mouse settings?', 'This overwrites DPI, buttons, polling rate, lighting and the other settings on the mouse with the ones in the file.', 'Import', false))) return;
  await msApplyAll(want, 'Mouse settings imported');
};

// Defaults from the official driver's cfg.json (colors differ for models 9 and 13).
function msDefaults(section) {
  const alt = [9, 13].includes(ms.mid);
  if (section === 'dpi') {
    const d = [400, 800, 1600, 2400, 3200, 6400], dpis = [...d, ...ms.dpis.slice(6)].map(v => ms.cfg ? Math.min(v, ms.cfg.max) : v);
    const colors = (alt ? [[255, 0, 0], [0, 0, 255], [0, 255, 0], [255, 255, 0], [0, 255, 255], [255, 0, 255]] : [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 128, 0], [0, 255, 255]]);
    return { ...(ms.cfg ? { dpis, dpisY: dpis } : {}), colors: [...colors, ...ms.colors.slice(6)], stages: 6, current: 1 };
  }
  if (section === 'buttons') return { keys: [[1, 0x100], [1, 0x200], [1, 0x400], [1, 0x800], [1, 0x1000], [2, 0x100]].map(([t, p]) => ({ t, p })) };
  if (section === 'performance') return { rate: 1, lod: 1, debounce: 8, motionSync: ms.sensor !== '3311', sleep: 6, angle: false, ripple: false };
  if (section === 'lighting') return { light: { ...ms.light, on: false, mode: 0, speed: 8, bright: 3, movingOff: false }, dpiFx: { on: false, mode: 0, bright: 5, speed: 3 } };
}
const MS_SECTION_TEXT = {
  dpi: ['DPI stages', '6 stages: 400, 800, 1600, 2400, 3200, 6400 DPI, stage 2 active, default colors.'],
  buttons: ['buttons', 'Left, right, wheel, back, forward and DPI cycle, as from the factory.'],
  performance: ['performance', 'Polling rate 1000 Hz, lift-off 1 mm, debounce 8 ms, motion sync on, sleep after 1 min, angle snapping and ripple control off.'],
  lighting: ['lighting', 'Light and DPI indicator off, default brightness and speed.'],
};
document.querySelectorAll('[data-ms-defaults]').forEach(b => b.onclick = async () => {
  if (!ms?.online || msBusy) return;
  const section = b.dataset.msDefaults, [name, what] = MS_SECTION_TEXT[section];
  if (!(await confirmDialog(`Restore default ${name}?`, what, 'Restore defaults'))) return;
  await msApplyAll(msDefaults(section), `Default ${name} restored`);
});

/* =========================================================
   Keyboard
   ========================================================= */
const mapEntries = m => [...m].map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]);
function kbSnapshot() {
  return {
    keymap: keymap.map(mapEntries), colors: mapEntries(keyColors),
    perf: Object.fromEntries(Object.entries(perf).map(([k, m]) => [k, mapEntries(m)])),
    global: { actuation: info.actuation, pressDead: info.pressDead ?? 0, releaseDead: info.releaseDead ?? 0 },
    light: light ? JSON.parse(JSON.stringify(light)) : null,
  };
}
function kbValidate(s) {
  const keys = new Set(layoutRows().flat()), out = {};
  const entries = (list, what, val) => arr(list, null, what).map((e, j) => {
    arr(e, 2, `${what} entry ${j + 1}`);
    if (!keys.has(e[0])) throw new BadFile(`${what}: key ${e[0]} isn't on this keyboard.`);
    return [e[0], val(e[1], `${what} key ${e[0]}`)];
  });
  if (s.keymap) out.keymap = arr(s.keymap, 4, 'Keymap layers').map((ly, i) => entries(ly, `Layer ${i + 1}`, (v, w) => {
    int(v, 0, 0xFFFF, w);
    if (i === 0 && v === 0x01) throw new BadFile(`${w}: value 0x01 on the base layer would make the key dead.`); // see AGENTS.md (Fn rule)
    return v;
  }));
  if (s.colors) out.colors = entries(s.colors, 'Key colors', (v, w) => rgb(v, w));
  if (s.perf) out.perf = Object.fromEntries(['mode', 'db0', 'rtp', 'rtr'].filter(k => s.perf[k]).map(k => [k, entries(s.perf[k], `Actuation (${k})`, (v, w) => int(v, 0, k === 'mode' ? 255 : 0xFFFF, w))]));
  if (s.global) {
    const mm = (v, w) => { if (typeof v !== 'number' || !(v >= 0 && v <= 10)) throw new BadFile(`${w} must be 0 to 10 mm.`); return v; };
    out.global = { actuation: mm(s.global.actuation, 'Global actuation'), pressDead: mm(s.global.pressDead, 'Press deadzone'), releaseDead: mm(s.global.releaseDead, 'Release deadzone') };
  }
  if (s.light) {
    const l = s.light, b = (v, w) => int(v, 0, 255, w);
    out.light = { colors: arr(l.colors, 7, 'Lighting colors').map((c, i) => rgb(c, `Lighting color ${i + 1}`)),
      on: bool(l.on, 'Lighting on'), dir: bool(l.dir, 'Lighting direction'), superResp: bool(l.superResp, 'Lighting response'),
      lum: b(l.lum, 'Brightness'), mode: b(l.mode, 'Lighting mode'), speed: b(l.speed, 'Lighting speed'), sleep: b(l.sleep, 'Lighting sleep'), staticMode: b(l.staticMode, 'Static mode') };
  }
  return out;
}
let kbImporting = false;
async function kbImport(w) {
  const batches = async (entries, build) => { for (let i = 0; i < entries.length; i += 14) await send(build(entries.slice(i, i + 14))); };
  if (w.keymap) await batches(w.keymap.flatMap((ly, i) => ly.filter(([k, v]) => keymap[i].get(k) !== v).map(([k, v]) => [k, i, v])), e => keyPack(true, e));
  if (w.perf) await batches(Object.entries(w.perf).flatMap(([name, list]) => list.filter(([k, v]) => perf[name].get(k) !== v)
    .map(([k, v]) => [k, +Object.keys(PERF_LAYER).find(ly => PERF_LAYER[ly] === name), v])), e => keyPack(true, e));
  if (w.colors) await batches(w.colors.filter(([k, c]) => toHex(keyColors.get(k) || [0, 0, 0]) !== toHex(c)).map(([k, c]) => [k, ...c]), e => krgbPack(true, e));
  if (w.global) await send(dbWritePack(w.global.actuation, w.global.pressDead, w.global.releaseDead));
  if (w.light) await send(prgbPack(1, w.light));
  await readAll(); // read everything back
  const bad = [];
  if (w.keymap && w.keymap.some((ly, i) => ly.some(([k, v]) => keymap[i].get(k) !== v))) bad.push('keymap');
  if (w.perf && Object.entries(w.perf).some(([n, list]) => list.some(([k, v]) => perf[n].get(k) !== v))) bad.push('actuation');
  if (w.colors && w.colors.some(([k, c]) => toHex(keyColors.get(k) || [0, 0, 0]) !== toHex(c))) bad.push('key colors');
  if (w.global && Math.abs((info.actuation ?? 0) - w.global.actuation) > 0.001) bad.push('global actuation');
  return bad;
}
$('kbExport').onclick = () => {
  if (!connected) return;
  downloadJson(`opendriver-keyboard-${today()}.json`, { app: 'OpenDriver', kind: 'keyboard', format: BACKUP_FORMAT, saved: new Date().toISOString(),
    model: { name: info.name ?? null, firmware: info.firmware ?? null }, settings: kbSnapshot() });
  toast('Keyboard settings exported', 'Saved as a JSON file in your downloads.');
};
$('kbImport').onclick = async () => {
  if (!connected || kbImporting) return;
  let want;
  try { const f = await pickJson(); if (!f) return; want = kbValidate(checkFile(f, 'keyboard')); }
  catch (e) { toast('Could not import', e.message, true); return; }
  if (!(await confirmDialog('Import keyboard settings?', 'This overwrites the keymap on all layers, actuation, key colors and lighting with the ones in the file.', 'Import', false))) return;
  kbImporting = true; $('kbImport').disabled = true;
  try {
    const bad = await kbImport(want);
    if (bad.length) toast('Some settings were not kept', `Not kept: ${bad.join(', ')}. The pages show what the keyboard stored.`, true);
    else toast('Keyboard settings imported', 'Everything was read back and matches the file.');
  } catch (e) { toast('Could not import', e.message, true); }
  finally { kbImporting = false; $('kbImport').disabled = false; }
};
