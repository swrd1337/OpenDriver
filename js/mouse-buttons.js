// OpenDriver · mouse-buttons.js
// Mouse button actions: clicks, scroll, DPI, fire key, DPI lock, media keys, key shortcuts and macros.
// Record formats are in docs/MOUSE-PROTOCOL.md ("Buttons", "Shortcut and media records", "Macros").

/* =========================================================
   Catalog
   ========================================================= */
// Simple actions: [label, type, param]. Same values the official driver's KeyOptions use.
const MS_ACTIONS = [
  ['Mouse', [['Left click', 1, 0x100], ['Right click', 1, 0x200], ['Wheel click', 1, 0x400], ['Back', 1, 0x800], ['Forward', 1, 0x1000]]],
  ['Scroll', [['Scroll up', 0xB, 0x100], ['Scroll down', 0xB, 0x200], ['Scroll left', 3, 0x100], ['Scroll right', 3, 0x200]]],
  ['DPI', [['DPI cycle', 2, 0x100], ['DPI up', 2, 0x200], ['DPI down', 2, 0x300]]],
  ['Lights', [['Toggle all lights', 8, 0], ['Toggle DPI indicator', 8, 0x100], ['Toggle light strip', 8, 0x300], ['Cycle light effects', 8, 0x400]]],
  ['Other', [['Polling rate switch', 7, 0], ['Disabled', 0, 0]]],
];
const MS_T = { DISABLED: 0, MOUSE: 1, FIRE: 4, SHORTCUT: 5, MACRO: 6, DPI_LOCK: 10 };
const LEFT_CLICK = [1, 0x100];
// Consumer-page usages (KeyOptions "Multimedia")
const MS_MEDIA = [[0xCD, 'Play / pause'], [0xB5, 'Next track'], [0xB6, 'Previous track'], [0xB7, 'Stop'], [0xE2, 'Mute'], [0xE9, 'Volume up'], [0xEA, 'Volume down'],
  [0x183, 'Media player'], [0x18A, 'Email'], [0x192, 'Calculator'], [0x194, 'My computer'], [0x223, 'Browser home'], [0x221, 'Search'],
  [0x225, 'Browser forward'], [0x224, 'Browser back'], [0x226, 'Stop page'], [0x227, 'Refresh page'], [0x22A, 'Favorites']];
// Key events: type 0 = modifier (bit mask), type 1 = key (HID usage), type 2 = consumer, type 4 = mouse button (macros).
const MS_MODS = [[1, 'Ctrl'], [2, 'Shift'], [4, 'Alt'], [8, 'Win'], [16, 'Right Ctrl'], [32, 'Right Shift'], [64, 'Right Alt'], [128, 'Right Win']];
const MS_KEYS = [
  ...Array.from({ length: 26 }, (_, i) => [4 + i, String.fromCharCode(65 + i), 'Key' + String.fromCharCode(65 + i)]),
  ...Array.from({ length: 10 }, (_, i) => [30 + i, String((i + 1) % 10), 'Digit' + ((i + 1) % 10)]),
  [40, 'Enter', 'Enter'], [41, 'Esc', 'Escape'], [42, 'Backspace', 'Backspace'], [43, 'Tab', 'Tab'], [44, 'Space', 'Space'],
  [45, '-', 'Minus'], [46, '=', 'Equal'], [47, '[', 'BracketLeft'], [48, ']', 'BracketRight'], [49, '\\', 'Backslash'],
  [51, ';', 'Semicolon'], [52, "'", 'Quote'], [53, '`', 'Backquote'], [54, ',', 'Comma'], [55, '.', 'Period'], [56, '/', 'Slash'], [57, 'Caps Lock', 'CapsLock'],
  ...Array.from({ length: 12 }, (_, i) => [58 + i, 'F' + (i + 1), 'F' + (i + 1)]),
  [70, 'Print Screen', 'PrintScreen'], [71, 'Scroll Lock', 'ScrollLock'], [72, 'Pause', 'Pause'], [73, 'Insert', 'Insert'], [74, 'Home', 'Home'],
  [75, 'Page Up', 'PageUp'], [76, 'Delete', 'Delete'], [77, 'End', 'End'], [78, 'Page Down', 'PageDown'],
  [79, '→', 'ArrowRight'], [80, '←', 'ArrowLeft'], [81, '↓', 'ArrowDown'], [82, '↑', 'ArrowUp'], [83, 'Num Lock', 'NumLock'],
  [84, 'Num /', 'NumpadDivide'], [85, 'Num *', 'NumpadMultiply'], [86, 'Num -', 'NumpadSubtract'], [87, 'Num +', 'NumpadAdd'], [88, 'Num Enter', 'NumpadEnter'],
  ...Array.from({ length: 9 }, (_, i) => [89 + i, 'Num ' + (i + 1), 'Numpad' + (i + 1)]), [98, 'Num 0', 'Numpad0'], [99, 'Num .', 'NumpadDecimal'], [101, 'Menu', 'ContextMenu'],
];
const MS_MOD_CODES = { ControlLeft: 1, ShiftLeft: 2, AltLeft: 4, MetaLeft: 8, ControlRight: 16, ShiftRight: 32, AltRight: 64, MetaRight: 128 };
const MS_MOUSE_EV = [[1, 'Left button'], [2, 'Right button'], [4, 'Wheel button'], [8, 'Back button'], [16, 'Forward button']]; // macro mouse events
// Ready-made shortcuts (KeyOptions "Combo key"), per OS like the official driver.
const MS_COMBOS = {
  win: [['Dictation', [8], 11], ['Action center', [8], 4], ['Task view', [8], 43], ['Show desktop', [8], 7], ['Screenshot', [8, 2], 22], ['Close window', [4], 61],
    ['Maximize window', [8], 82], ['Minimize window', [8], 81], ['Cut', [1], 27], ['Copy', [1], 6], ['Paste', [1], 25], ['Undo', [1], 29],
    ['Zoom in', [1], 46], ['Zoom out', [1], 45], ['New browser tab', [1], 23], ['Lock', [8], 15]],
  mac: [['Task view', [1], 82], ['Screenshot', [2, 8], 32], ['Close window', [8], 26], ['Maximize window', [1, 8], 9], ['Minimize window', [8], 16],
    ['Cut', [8], 27], ['Copy', [8], 6], ['Paste', [8], 25], ['Undo', [8], 29], ['Zoom in', [8], 46], ['Zoom out', [8], 45], ['New browser tab', [8], 23], ['Lock', [1, 8], 20]],
};
const msOs = /Mac/i.test(navigator.userAgentData?.platform || navigator.platform || '') ? 'mac' : 'win';
const comboEvents = (mods, key) => [...mods.map(m => ({ type: 0, value: m })), { type: 1, value: key }];
const msKeyName = e => e.type === 0 ? MS_MODS.find(m => m[0] === e.value)?.[1] ?? `Mod ${e.value}`
  : e.type === 1 ? MS_KEYS.find(k => k[0] === e.value)?.[1] ?? `Key ${e.value}`
  : e.type === 2 ? MS_MEDIA.find(m => m[0] === e.value)?.[1] ?? `Media ${e.value}`
  : e.type === 4 ? MS_MOUSE_EV.find(m => m[0] === e.value)?.[1] ?? `Mouse ${e.value}` : `Event ${e.type}:${e.value}`;
const sameEvents = (a, b) => a.length === b.length && a.every((e, i) => e.type === b[i].type && e.value === b[i].value);

/* =========================================================
   Records
   ========================================================= */
const MS_MACRO_MAX = 70, MS_SHORTCUT_MAX = 5; // events per macro (driver check); keys per shortcut (32-byte slot)
const MS_REPEAT = [[254, 'Until the button is released'], [253, 'Until the button is pressed again'], [255, 'Until any button is pressed']];

// Shortcut slot: [event count, presses (type|0x80, lo, hi)…, releases in reverse (type|0x40, lo, hi)…, check]
function shortcutRecord(events) {
  const ev = (e, f) => [e.type | f, e.value & 255, e.value >> 8 & 255];
  return msRecord([events.length * 2, ...events.flatMap(e => ev(e, 0x80)), ...events.slice().reverse().flatMap(e => ev(e, 0x40))]);
}
// Macro slot: [name length, UTF-8 name (30 bytes, 0xFF padded), event count, events (5 bytes)…, check]
function macroRecord(m) {
  const name = new TextEncoder().encode(m.name).slice(0, 30), n = m.events.length;
  const out = new Array(32).fill(255);
  out[0] = name.length; name.forEach((b, i) => out[1 + i] = b); out[31] = n;
  const ev = m.events.flatMap(e => [(e.down ? 0x80 : 0x40) | e.type, e.value & 255, e.value >> 8 & 255, e.delay >> 8 & 255, e.delay & 255]);
  return [...out, ...ev, 85 - msSum(ev) - n & 255];
}
function parseMacro(head, body) {
  const len = head[0], n = head[31];
  if (!(len > 0 && len <= 30 && n <= MS_MACRO_MAX)) return null; // same validity check as the driver
  const events = [];
  for (let a = 0; a < n; a++) {
    const b = body.slice(a * 5, a * 5 + 5);
    events.push({ down: b[0] >> 6 === 2, type: b[0] & 15, value: b[2] << 8 | b[1], delay: b[3] << 8 | b[4] });
  }
  return { name: new TextDecoder().decode(new Uint8Array(head.slice(1, 1 + len))), events };
}

// Button i's 3 record bytes -> action, reading the shortcut / macro slot it points to.
async function msReadKey(i, b) {
  const k = { t: b[0], p: b[1] << 8 | b[2] };
  if (k.t === MS_T.DPI_LOCK) k.lock = dpiFromValue(b[1] | b[2] << 8, 0, ms.sensor);
  if (k.t === MS_T.SHORTCUT) {
    const addr = MS_ADDR.SHORTCUT + i * 32, r = await msRead(addr, 10);
    if (r[0] >= 2 && r[0] <= MS_SHORTCUT_MAX * 2 && r[0] % 2 === 0) { // 32-byte slot: count * 3 + 2 <= 32
      const len = r[0] * 3 + 2;
      if (len > 10) r.push(...await msRead(addr + 10, len - 10));
      const ev = Array.from({ length: r[0] / 2 }, (_, a) => ({ type: r[1 + a * 3] & 15, value: r[3 + a * 3] << 8 | r[2 + a * 3] }));
      if (ev.length === 1 && ev[0].type === 2) k.media = ev[0].value; else k.sc = ev;
    } else k.sc = [];
  }
  if (k.t === MS_T.MACRO) {
    const addr = MS_ADDR.MACRO + i * 384, head = await msRead(addr, 32);
    const n = head[31] <= MS_MACRO_MAX ? head[31] : 0;
    k.mc = parseMacro(head, n ? await msRead(addr + 32, n * 5 + 1) : []);
    k.repeat = b[2];
  }
  return k;
}
// Write an action: its shortcut / macro data first, then the button record pointing at it.
async function msWriteKey(i, k) {
  if (k.t === MS_T.SHORTCUT) await msWrite(MS_ADDR.SHORTCUT + i * 32, shortcutRecord(k.media != null ? [{ type: 2, value: k.media }] : k.sc));
  if (k.t === MS_T.MACRO) await msWrite(MS_ADDR.MACRO + i * 384, macroRecord(k.mc));
  let rec;
  if (k.t === MS_T.DPI_LOCK) { const v = dpiValue(k.lock, ms.sensor).v; rec = [k.t, v & 255, v >> 8]; } // this one is low byte first
  else if (k.t === MS_T.MACRO) rec = [k.t, i, k.repeat]; // param = slot << 8 | repeat
  else if (k.t === MS_T.SHORTCUT) rec = [k.t, 0, 0];
  else rec = [k.t, k.p >> 8, k.p & 255];
  await msWrite(MS_ADDR.KEYS + i * 4, msRecord(rec));
}
const keyEquals = (a, b) => a.t === b.t && (
  a.t === MS_T.DPI_LOCK ? a.lock === b.lock
  : a.t === MS_T.SHORTCUT ? (a.media ?? null) === (b.media ?? null) && sameEvents(a.sc || [], b.sc || [])
  : a.t === MS_T.MACRO ? a.repeat === b.repeat && a.mc?.name === b.mc?.name && a.mc?.events.length === b.mc?.events.length
    && a.mc.events.every((e, j) => ['down', 'type', 'value', 'delay'].every(f => e[f] === b.mc.events[j][f]))
  : a.p === b.p);

/* =========================================================
   Describe / choose
   ========================================================= */
const simpleAction = k => MS_ACTIONS.flatMap(g => g[1]).find(a => a[1] === k.t && a[2] === k.p);
function keyChoice(k) {
  if (k.t === MS_T.FIRE) return 'fire';
  if (k.t === MS_T.DPI_LOCK) return 'lock';
  if (k.t === MS_T.MACRO) return 'macro';
  if (k.t === MS_T.SHORTCUT) {
    if (k.media != null) return MS_MEDIA.some(m => m[0] === k.media) ? `media:${k.media}` : 'other';
    const c = MS_COMBOS[msOs].findIndex(([, mods, key]) => sameEvents(k.sc, comboEvents(mods, key)));
    return c >= 0 ? `combo:${c}` : 'combo:custom';
  }
  return simpleAction(k) ? `b:${k.t}:${k.p}` : 'other';
}
function keySummary(k) {
  if (k.t === MS_T.FIRE) return `Clicks ${k.p & 255 || 'while held'}${k.p & 255 ? ' times' : ''}, every ${k.p >> 8} ms`; // param = interval << 8 | times
  if (k.t === MS_T.DPI_LOCK) return `${k.lock} DPI while held`;
  if (k.t === MS_T.SHORTCUT && k.media == null) return k.sc.length ? k.sc.map(msKeyName).join(' + ') : 'Empty shortcut';
  if (k.t === MS_T.MACRO) return k.mc ? `${k.mc.name} · ${k.mc.events.length} events · ${k.repeat <= 250 ? `${k.repeat}×` : MS_REPEAT.find(r => r[0] === k.repeat)?.[1].toLowerCase() ?? 'repeat ' + k.repeat}` : 'Empty macro';
  return '';
}
const isLeft = k => k.t === LEFT_CLICK[0] && k.p === LEFT_CLICK[1];

async function msSetKey(i, k, label) {
  const lefts = ms.keys.filter(isLeft).length;
  if (isLeft(ms.keys[i]) && !isLeft(k) && lefts < 2) { // same rule as the official driver
    toast('Keep one left click', 'Map Left click to another button first, or you could lose the ability to click.', true);
    renderMouse(); return;
  }
  await msApply(() => msWriteKey(i, k), () => keyEquals(ms.keys[i], k), `${MS_BUTTONS[i]} now does ${label}.`, `${MS_BUTTONS[i]} did not change.`);
}
async function msChoose(i, choice) {
  const old = ms.keys[i];
  if (choice.startsWith('b:')) { const [, t, p] = choice.split(':').map(Number); return msSetKey(i, { t, p }, simpleAction({ t, p })[0].toLowerCase()); }
  if (choice.startsWith('media:')) { const m = +choice.slice(6); return msSetKey(i, { t: MS_T.SHORTCUT, p: 0, media: m }, MS_MEDIA.find(x => x[0] === m)[1].toLowerCase()); }
  if (choice.startsWith('combo:') && choice !== 'combo:custom') {
    const [label, mods, key] = MS_COMBOS[msOs][+choice.slice(6)];
    return msSetKey(i, { t: MS_T.SHORTCUT, p: 0, sc: comboEvents(mods, key) }, label.toLowerCase());
  }
  if (choice === 'combo:custom') return msEditCombo(i);
  if (choice === 'fire') return msSetKey(i, { t: MS_T.FIRE, p: old.t === MS_T.FIRE ? old.p : 10 << 8 | 3 }, 'fire key');
  if (choice === 'lock') return msSetKey(i, { t: MS_T.DPI_LOCK, lock: old.lock ?? 400 }, 'DPI lock');
  if (choice === 'macro') return msEditMacro(i);
}

/* =========================================================
   Page
   ========================================================= */
function renderMsButtons() {
  $('msKeys').replaceChildren(...MS_BUTTONS.map((name, i) => {
    const k = ms.keys[i], wrap = msEl('div'), row = msEl('div', { className: 'field-row' }), sel = msEl('select', { className: 'select' });
    sel.setAttribute('aria-label', `${name} action`);
    const choice = keyChoice(k), add = (parent, label, value) => parent.append(new Option(label, value, false, value === choice));
    if (choice === 'other') sel.append(Object.assign(new Option('Other (set in the official driver)', 'other', false, true), { disabled: true }));
    for (const [group, acts] of MS_ACTIONS) {
      const og = msEl('optgroup', { label: group });
      acts.forEach(([label, t, p]) => add(og, label, `b:${t}:${p}`));
      if (group === 'Mouse') { add(og, 'Fire key (repeated left click)', 'fire'); }
      if (group === 'DPI') add(og, 'DPI lock (sniper)', 'lock');
      sel.append(og);
    }
    const media = msEl('optgroup', { label: 'Media' }); MS_MEDIA.forEach(([u, label]) => add(media, label, `media:${u}`));
    const combos = msEl('optgroup', { label: 'Shortcuts' }); MS_COMBOS[msOs].forEach(([label], c) => add(combos, label, `combo:${c}`));
    add(combos, 'Custom shortcut…', 'combo:custom');
    const macro = msEl('optgroup', { label: 'Macro' }); add(macro, 'Macro…', 'macro');
    sel.append(media, combos, macro);
    sel.onchange = () => msChoose(i, sel.value);
    row.append(msEl('span', { className: 'field-label', textContent: name }), sel);
    wrap.append(row);

    // extra controls for actions that have settings
    const extra = msEl('div', { className: 'ms-extra' }), hint = msEl('span', { className: 'field-hint', textContent: keySummary(k) });
    if (k.t === MS_T.FIRE) {
      const times = msEl('select', { className: 'select' }), interval = msEl('input', { className: 'input', type: 'number', min: 10, max: 255, value: k.p >> 8 });
      times.setAttribute('aria-label', `${name} fire key clicks`); interval.setAttribute('aria-label', `${name} fire key interval in ms`);
      [[0, 'While held'], [1, '1 click'], [2, '2 clicks'], [3, '3 clicks']].forEach(([v, l]) => times.append(new Option(l, v, false, v === (k.p & 255))));
      interval.style.maxWidth = '90px';
      const save = () => msSetKey(i, { t: MS_T.FIRE, p: Math.min(255, Math.max(10, Math.round(interval.valueAsNumber) || 10)) << 8 | +times.value }, 'fire key');
      times.onchange = save; interval.onchange = save;
      extra.append(times, interval, msEl('span', { className: 'field-hint', textContent: 'ms apart' }));
    } else if (k.t === MS_T.DPI_LOCK) {
      const lock = msEl('select', { className: 'select' });
      lock.setAttribute('aria-label', `${name} locked DPI`);
      const opts = Array.from({ length: 10 }, (_, j) => (j + 1) * 100);
      if (!opts.includes(k.lock)) lock.append(Object.assign(new Option(`${k.lock} DPI`, k.lock, false, true), { disabled: true }));
      opts.forEach(v => lock.append(new Option(`${v} DPI`, v, false, v === k.lock)));
      lock.onchange = () => msSetKey(i, { t: MS_T.DPI_LOCK, lock: +lock.value }, `DPI lock at ${lock.value}`);
      extra.append(lock, msEl('span', { className: 'field-hint', textContent: 'while held' }));
    } else if (k.t === MS_T.MACRO || (k.t === MS_T.SHORTCUT && k.media == null && choice === 'combo:custom')) {
      const edit = msEl('button', { className: 'btn btn-outline btn-sm', textContent: 'Edit' });
      edit.setAttribute('aria-label', `Edit ${name} ${k.t === MS_T.MACRO ? 'macro' : 'shortcut'}`);
      edit.onclick = () => k.t === MS_T.MACRO ? msEditMacro(i) : msEditCombo(i);
      extra.append(hint, edit);
    }
    if (extra.children.length) wrap.append(extra);
    return wrap;
  }));
}

/* =========================================================
   Dialogs: custom shortcut and macro editor
   ========================================================= */
const msDialog = dlg => new Promise(res => { dlg.addEventListener('close', () => res(dlg.returnValue === 'ok'), { once: true }); dlg.returnValue = ''; dlg.showModal(); });

async function msEditCombo(i) {
  const k = ms.keys[i], cur = k.t === MS_T.SHORTCUT && k.media == null ? k.sc : [];
  $('scButton').textContent = MS_BUTTONS[i];
  const mods = $('scMods');
  mods.replaceChildren(...MS_MODS.slice(0, 4).map(([m, l]) => {
    const lab = msEl('label', { className: 'sc-mod' }), cb = msEl('input', { type: 'checkbox', value: m, checked: cur.some(e => e.type === 0 && e.value === m) });
    lab.append(cb, ' ' + l); return lab;
  }));
  const key = $('scKey'), curKey = cur.find(e => e.type === 1)?.value;
  key.replaceChildren(...MS_KEYS.map(([u, l]) => new Option(l, u, false, u === curKey)));
  if (!(await msDialog($('scDlg')))) { renderMouse(); return; }
  const picked = [...mods.querySelectorAll('input:checked')].map(c => +c.value);
  const ev = comboEvents(picked, +key.value);
  await msSetKey(i, { t: MS_T.SHORTCUT, p: 0, sc: ev }, ev.map(msKeyName).join(' + '));
}

let mcEvents = [], mcRecording = false, mcLast = 0;
function renderMacroList() {
  $('mcCount').textContent = `${mcEvents.length} / ${MS_MACRO_MAX} events`;
  $('mcList').replaceChildren(...(mcEvents.length ? mcEvents.map((e, j) => {
    const row = msEl('div', { className: 'mc-row' });
    const what = msEl('span', { textContent: `${e.down ? 'Press' : 'Release'} ${msKeyName(e)}` });
    const delay = msEl('input', { className: 'input', type: 'number', min: 0, max: 65535, value: e.delay });
    delay.setAttribute('aria-label', `Delay after event ${j + 1} in ms`);
    delay.onchange = () => { e.delay = Math.min(65535, Math.max(0, Math.round(delay.valueAsNumber) || 0)); delay.value = e.delay; };
    const del = msEl('button', { type: 'button', className: 'btn btn-outline btn-sm', textContent: 'Remove' });
    del.setAttribute('aria-label', `Remove event ${j + 1}`);
    del.onclick = () => { mcEvents.splice(j, 1); renderMacroList(); };
    row.append(what, delay, msEl('span', { className: 'field-hint', textContent: 'ms' }), del);
    return row;
  }) : [msEl('div', { className: 'empty-note', textContent: 'No events yet. Click Record and type, or add a mouse click.' })]));
  $('mcSave').disabled = !mcEvents.length;
}
function mcAdd(e) {
  if (mcEvents.length >= MS_MACRO_MAX) { mcStop(); toast('Macro is full', `A macro holds up to ${MS_MACRO_MAX} events.`, true); return; }
  const now = performance.now();
  if (mcRecording && mcEvents.length) mcEvents.at(-1).delay = Math.min(65535, Math.max(1, Math.round(now - mcLast)));
  mcLast = now;
  mcEvents.push({ delay: 10, ...e });
  renderMacroList();
}
function mcKey(ev) {
  if (!mcRecording || ev.repeat) return;
  const mod = MS_MOD_CODES[ev.code], key = MS_KEYS.find(k => k[2] === ev.code);
  if (mod == null && !key) return;
  ev.preventDefault(); ev.stopPropagation();
  mcAdd({ down: ev.type === 'keydown', type: mod != null ? 0 : 1, value: mod ?? key[0] });
}
function mcStop() { mcRecording = false; $('mcRecord').textContent = 'Record'; $('mcRecord').setAttribute('aria-pressed', 'false'); }

async function msEditMacro(i) {
  const k = ms.keys[i], cur = k.t === MS_T.MACRO && k.mc ? k.mc : { name: `${MS_BUTTONS[i]} macro`, events: [] };
  $('mcButton').textContent = MS_BUTTONS[i];
  $('mcName').value = cur.name;
  mcEvents = cur.events.map(e => ({ ...e }));
  const repeat = k.t === MS_T.MACRO ? k.repeat : 1;
  $('mcRepeat').value = repeat <= 250 ? 'times' : String(repeat);
  $('mcTimes').value = repeat <= 250 ? repeat : 1;
  $('mcTimes').hidden = repeat > 250;
  mcStop(); renderMacroList();
  const ok = await msDialog($('macroDlg'));
  mcStop();
  if (!ok || !mcEvents.length) { renderMouse(); return; }
  const name = $('mcName').value.trim() || 'Macro';
  const rep = $('mcRepeat').value === 'times' ? Math.min(250, Math.max(1, Math.round($('mcTimes').valueAsNumber) || 1)) : +$('mcRepeat').value;
  await msSetKey(i, { t: MS_T.MACRO, repeat: rep, mc: { name, events: mcEvents } }, `the macro "${name}"`);
}

$('mcRecord').onclick = () => {
  mcRecording = !mcRecording;
  $('mcRecord').textContent = mcRecording ? 'Stop recording' : 'Record';
  $('mcRecord').setAttribute('aria-pressed', String(mcRecording));
  if (mcRecording) { mcLast = performance.now(); $('mcRecord').blur(); }
};
$('mcAddClick').onclick = () => {
  const v = +$('mcMouse').value;
  mcAdd({ down: true, type: 4, value: v }); mcAdd({ down: false, type: 4, value: v });
};
$('mcClear').onclick = () => { mcEvents = []; renderMacroList(); };
$('mcRepeat').onchange = e => { $('mcTimes').hidden = e.target.value !== 'times'; };
$('mcMouse').replaceChildren(...MS_MOUSE_EV.map(([v, l]) => new Option(l, v)));
$('macroDlg').addEventListener('keydown', mcKey, true);
$('macroDlg').addEventListener('keyup', mcKey, true);
$('macroDlg').addEventListener('cancel', e => { if (mcRecording) e.preventDefault(); }); // Esc while recording is a recorded key
$('mcName').addEventListener('input', e => { // the slot holds 30 bytes of UTF-8
  while (new TextEncoder().encode(e.target.value).length > 30) e.target.value = e.target.value.slice(0, -1);
});
