// OpenDriver · custom-lighting.js
// Custom (per-key RGB) lighting editor.

/* =========================================================
   Custom per-key lighting
   ========================================================= */
const CK_SWATCHES = ['#ffffff', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#00c7be', '#0a84ff', '#ff2d55'];
let ckColor = [10, 132, 255];
let ckChain = Promise.resolve();   // serialises our KRGB writes
const ckQueue = new Set(); let ckTimer = 0;
const isOff = c => !c || (c[0] | c[1] | c[2]) === 0;
const sameColor = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

function renderCustom() {
  const on = !!light && connected && group() === 3;
  $('customCard').hidden = !on;
  if (!on) return;
  $('ckKb').querySelectorAll('.key').forEach(k => {
    const c = keyColors.get(+k.dataset.code);
    const lit = !isOff(c);
    k.classList.toggle('lit', lit);
    if (lit) {
      k.style.setProperty('--kc', `rgb(${c.join(' ')})`);
      k.style.setProperty('--kfg', (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 150 ? '#111' : '#fff');
    } else { k.style.removeProperty('--kc'); k.style.removeProperty('--kfg'); }
    k.title = `${physName(+k.dataset.code)} · ${lit ? toHex(c).toUpperCase() : 'off'}`;
  });
  $('ckRevert').disabled = !ckDirty;
  $('ckLegend').textContent = !keyColors.size ? 'Reading key colors…' : 'Click or drag across keys to paint. Right-click a key to pick up its color.';
  const hex = toHex(ckColor);
  $('ckHex').textContent = hex.toUpperCase();
  if ($('ckColor').value !== hex) $('ckColor').value = hex;
  [...$('ckSwatches').children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hex === hex)));
}

// paint locally right away, send to the keyboard in batches of 14
function paintKeys(codes, color = ckColor, mark = true) {
  for (const code of codes) { keyColors.set(code, color.slice()); ckQueue.add(code); }
  if (mark) ckDirty = true;
  renderCustom(); renderPreview();
  clearTimeout(ckTimer);
  ckTimer = setTimeout(flushPaint, 40);
}
function flushPaint() {
  const codes = [...ckQueue]; ckQueue.clear();
  if (!codes.length) return ckChain;
  ckChain = ckChain.then(async () => {
    for (let i = 0; i < codes.length; i += 14)
      await send(krgbPack(true, codes.slice(i, i + 14).map(c => [c, ...keyColors.get(c)])), 12);
  }).catch(e => toast('Could not set key colors', e.message, true));
  return ckChain;
}

function revertCustom() {
  const codes = layoutRows().flat().filter(k => savedColors.has(k) && !sameColor(keyColors.get(k), savedColors.get(k)));
  for (const k of codes) keyColors.set(k, savedColors.get(k).slice());
  ckQueue.clear(); codes.forEach(k => ckQueue.add(k));
  ckDirty = false; renderCustom(); renderPreview();
  flushPaint();
  toast('Changes undone', 'Key colors are back to how they were when you connected.');
}

function hslToRgb(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}
function applyPreset(name) {
  const keys = [...$('ckKb').querySelectorAll('.key')];
  if (name === 'fill') paintKeys(keys.map(k => +k.dataset.code));
  if (name === 'off') paintKeys(keys.map(k => +k.dataset.code), [0, 0, 0]);
  if (name === 'wasd') {
    const hot = new Set([26, 4, 22, 7, 82, 80, 81, 79]); // W A S D, arrows
    paintKeys(keys.filter(k => !hot.has(+k.dataset.code)).map(k => +k.dataset.code), [0, 0, 0]);
    paintKeys([...hot].filter(c => keys.some(k => +k.dataset.code === c)));
  }
  if (name === 'rainbow') for (const k of keys) {
    const x = parseFloat(k.style.getPropertyValue('--x')) || 0;
    keyColors.set(+k.dataset.code, hslToRgb((x / 16) * 330, 1, .5)); ckQueue.add(+k.dataset.code);
  }
  if (name === 'rainbow') { ckDirty = true; renderCustom(); renderPreview(); clearTimeout(ckTimer); ckTimer = setTimeout(flushPaint, 40); }
}

function setPaintColor(c) { ckColor = c; renderCustom(); }

(function initCustom() {
  for (const hex of CK_SWATCHES) {
    const b = document.createElement('button');
    b.className = 'ck-sw'; b.dataset.hex = hex; b.style.setProperty('--sw', hex); b.setAttribute('aria-label', 'Paint with ' + hex);
    b.onclick = () => setPaintColor(fromHex(hex));
    $('ckSwatches').appendChild(b);
  }
  $('ckColor').oninput = e => setPaintColor(fromHex(e.target.value));
  $('ckRevert').onclick = revertCustom;
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => applyPreset(b.dataset.preset));

  const kb = $('ckKb');
  let painting = false, lastKey = null;
  kb.addEventListener('pointerdown', e => {
    const k = e.target.closest('.key');
    if (!k || e.button !== 0) return;
    e.preventDefault();
    painting = true; lastKey = k;
    kb.setPointerCapture(e.pointerId);
    paintKeys([+k.dataset.code]);
  });
  kb.addEventListener('pointermove', e => {
    if (!painting) return;
    const k = document.elementFromPoint(e.clientX, e.clientY)?.closest('#ckKb .key');
    if (k && k !== lastKey) { lastKey = k; paintKeys([+k.dataset.code]); }
  });
  const stop = () => { painting = false; lastKey = null; };
  kb.addEventListener('pointerup', stop); kb.addEventListener('pointercancel', stop);
  kb.addEventListener('contextmenu', e => {
    const k = e.target.closest('.key'); if (!k) return;
    e.preventDefault();
    const c = keyColors.get(+k.dataset.code);
    if (c && !isOff(c)) { setPaintColor(c.slice()); toast('Color picked', toHex(c).toUpperCase() + ' is now your paint color.'); }
  });
})();
