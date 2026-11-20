// OpenDriver · keyboard.js
// Keyboard layout, the on-screen keyboard builder and the Overview lighting preview.

/* =========================================================
   Keyboard layout: from the keyboard's matrix when known, else the AK680 MAX default
   ========================================================= */
const DEFAULT_ROWS = [
  [41, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 45, 46, 42, 74],
  [43, 20, 26, 8, 21, 23, 28, 24, 12, 18, 19, 47, 48, 49, 75],
  [57, 4, 22, 7, 9, 10, 11, 13, 14, 15, 51, 52, 40, 78],
  [225, 29, 27, 6, 25, 5, 17, 16, 54, 55, 56, 229, 82, 77],
  [224, 227, 226, 44, 230, 1, 228, 80, 81, 79],
];
const WIDTH = { 42: 2, 43: 1.5, 49: 1.5, 57: 1.75, 40: 2.25, 225: 2.25, 229: 1.75, 224: 1.25, 227: 1.25, 226: 1.25, 44: 6.25 };
function layoutRows() {
  const rows = matrixRows.filter(r => r && r.length).map(r => r.slice().sort((a, b) => a.col - b.col).map(k => k.code));
  return rows.length ? rows : DEFAULT_ROWS;
}
function buildKeyboard(el, onKey) {
  const interactive = !!onKey;
  el.innerHTML = '';
  for (const row of layoutRows()) {
    const r = document.createElement('div'); r.className = 'kb-row';
    let x = 0;
    for (const code of row) {
      const w = WIDTH[code] || 1;
      const k = document.createElement(interactive ? 'button' : 'div');
      k.className = 'key'; k.dataset.code = code;
      k.style.setProperty('--w', w); k.style.setProperty('--x', x + w / 2);
      k.textContent = code === 44 ? '' : code === 1 ? 'Fn' : keyShort(code);
      if (interactive) { k.type = 'button'; k.onclick = e => onKey(code, e); }
      r.appendChild(k); x += w;
    }
    el.appendChild(r);
  }
}
let kbRaf = 0, kbRebuild = false;
function refreshKeyboards(rebuild) {
  kbRebuild ||= rebuild;
  cancelAnimationFrame(kbRaf);
  kbRaf = requestAnimationFrame(() => {
    if (kbRebuild) { buildAllKeyboards(); kbRebuild = false; }
    renderPreview(); renderKeymap(); renderCustom(); renderPerf();
  });
}
function renderPreview() {
  if (!light) return;
  const kb = $('kb');
  const on = light.on, isStatic = light.mode === 0, isDyn = light.mode > 0 && light.mode <= 20;
  kb.classList.toggle('lit', on);
  kb.classList.toggle('wave', on && (isDyn || (isStatic && light.staticMode === 7)));
  kb.classList.toggle('rev', light.dir);
  kb.style.setProperty('--glow', on ? Math.max(.15, light.lum / 4) : 0);
  kb.style.setProperty('--speed', light.speed);
  if (isStatic && light.staticMode < 7) kb.style.setProperty('--col', `rgb(${light.colors[light.staticMode].join(' ')})`);
  else kb.style.removeProperty('--col');
  // custom mode: each key glows in its own color
  const isCustom = on && light.mode > 20;
  kb.querySelectorAll('.key').forEach(k => {
    const c = isCustom ? keyColors.get(+k.dataset.code) : null;
    if (c) k.style.setProperty('--col', `rgb(${c.join(' ')})`); else k.style.removeProperty('--col');
  });
  $('kbLegend').textContent = !on ? 'Lighting off'
    : isStatic ? `Static · ${light.staticMode < 7 ? toHex(light.colors[light.staticMode]).toUpperCase() : 'Multicolor'} · brightness ${light.lum}/4`
    : isDyn ? `Dynamic effect ${String(light.mode).padStart(2, '0')} · speed ${light.speed}/4`
    : `Custom per-key colors · brightness ${light.lum}/4`;
}

function buildAllKeyboards() {
  buildKeyboard($('kb'), null);
  buildKeyboard($('kmKb'), selectKey);
  buildKeyboard($('ckKb'), (code, e) => { if (e.detail === 0) paintKeys([code]); }); // keyboard activation; mouse/touch is handled by pointer events
  buildKeyboard($('trKb'), null);
  buildKeyboard($('acKb'), (code, e) => { if (e.detail === 0) { acSel.has(code) ? acSel.delete(code) : acSel.add(code); loadSelectionValues(); renderPerf(); } });
}
