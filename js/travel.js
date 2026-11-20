// OpenDriver · travel.js
// Live key travel test on the Actuation page.

/* =========================================================
   Live key travel (RM6X21 0x12, datatype 2)
   ========================================================= */
const RM = 0x12;
const travelNow = new Map();   // defaultCode -> mm
const trHist = [];             // focus-key travel history (mm)
let trRunning = false, trWaiter = null, trFocus = null, trFocusIdle = 0;

// position (row, col) -> default code, from the matrix read on connect
function trCodeAt(row, col) {
  const r = matrixRows[row];
  return r ? r.find(k => k.col === col)?.code : undefined;
}
function onTravelReply(n) {
  if (n[1] !== 2 || !trWaiter) return;
  if (!trRunning) { const w = trWaiter; trWaiter = null; w.res(false); return; } // late reply after Stop
  const base = (trWaiter.half - 1) * 3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 21; j++) {
    const o = 2 + (i * 21 + j) * 2;
    const code = trCodeAt(base + i, j);
    if (code != null) travelNow.set(code, (n[o] | n[o + 1] << 8) / 1000);
  }
  const w = trWaiter; trWaiter = null; w.res(true);
}
function requestTravel(half) {
  return new Promise(res => {
    trWaiter = { half, res };
    send(pack(CMD.RM ?? RM, [2, half, 0xff, 0xff]), 0).catch(() => {});
    setTimeout(() => { if (trWaiter && trWaiter.res === res) { trWaiter = null; res(false); } }, 250);
  });
}
async function trLoop() {
  while (trRunning && connected) {
    const a = await requestTravel(1);
    const b = trRunning && connected ? await requestTravel(2) : false;
    if (!a && !b) await wait(100);
    renderTravel();
  }
}
function setTravelRunning(on) {
  on = on && connected;
  if (on === trRunning) return;
  trRunning = on;
  $('trToggle').innerHTML = on
    ? '<svg viewBox="0 0 24 24" class="i"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>Stop'
    : '<svg viewBox="0 0 24 24" class="i"><path d="M7 4v16l13-8Z"/></svg>Start';
  $('trToggle').className = 'btn btn-sm ' + (on ? 'btn-outline' : 'btn-primary');
  $('trLegend').textContent = on ? 'Live: press any key. The keyboard below shows how far each one goes down.' : 'Press Start, then press keys: the keyboard below shows how far each one goes down.';
  $('trBody').hidden = !on; $('acKb').classList.toggle('travel', on);
  if (on) { trHist.length = 0; trLoop(); }
  else { if (trWaiter) { const w = trWaiter; trWaiter = null; w.res(false); } travelNow.clear(); trFocus = null; renderTravel(); }
}

// actuation point (mm) the key currently uses
function actuationOf(code) {
  const t = touchOf(code);
  if ((t === TOUCH.FIXED || t === TOUCH.RT) && perf.db0.has(code)) return perf.db0.get(code) / 1000;
  return info.actuation ?? 1.5;
}

function renderTravel() {
  const max = travelRange().max;
  $('trMax').textContent = max.toFixed(1) + ' mm';
  // depth is drawn on the per-key keyboard (Actuation page) while running
  $('acKb').querySelectorAll('.key').forEach(k => {
    const code = +k.dataset.code, v = travelNow.get(code) || 0;
    k.style.setProperty('--t', Math.min(1, v / max).toFixed(3));
    k.classList.toggle('hit', v > 0 && v >= actuationOf(code));
  });
  // focus = deepest key; hold the last one briefly after release
  let best = null, bestV = 0;
  for (const [code, v] of travelNow) if (v > bestV) { best = code; bestV = v; }
  if (best != null && bestV > 0.05) { trFocus = best; trFocusIdle = 0; } else trFocusIdle++;
  const v = trFocus != null ? (travelNow.get(trFocus) || 0) : 0;
  const act = trFocus != null ? actuationOf(trFocus) : (info.actuation ?? 1.5);
  if (trRunning) { trHist.push(v); if (trHist.length > 180) trHist.shift(); }

  $('trFill').style.setProperty('--t', Math.min(1, v / max));
  $('trAct').style.setProperty('--a', Math.min(1, act / max));
  $('trKey').textContent = trFocus != null ? physName(trFocus) : '—';
  $('trMm').textContent = v.toFixed(2) + ' mm';
  const mode = trFocus != null ? TOUCH_NAMES[touchOf(trFocus)] || 'Global' : '';
  $('trSub').textContent = trFocus == null ? (trRunning ? 'No key pressed yet' : 'Not running')
    : `${mode} · actuates at ${act.toFixed(2)} mm · ${v >= act && v > 0 ? 'registered' : 'not registered'}`;
  drawTravelChart(max, act);
}

function drawTravelChart(max, act) {
  const c = $('trChart'); if (!c) return;
  const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const info_ = css.getPropertyValue('--info').trim(), muted = css.getPropertyValue('--muted-fg').trim(), border = css.getPropertyValue('--border').trim();
  const pad = 6, y = mmv => pad + (mmv / max) * (h - pad * 2);   // 0 mm at the top, like a key going down
  g.strokeStyle = border; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const yy = pad + i * (h - pad * 2) / 4; g.beginPath(); g.moveTo(0, yy); g.lineTo(w, yy); g.stroke(); }
  g.setLineDash([4, 4]); g.strokeStyle = muted; g.beginPath(); g.moveTo(0, y(act)); g.lineTo(w, y(act)); g.stroke(); g.setLineDash([]);
  g.fillStyle = muted; g.font = '11px Geist, sans-serif'; g.fillText(`actuation ${act.toFixed(2)} mm`, 6, Math.max(12, y(act) - 4));
  if (trHist.length < 2) return;
  const step = w / 179;
  g.beginPath();
  trHist.forEach((v, i) => { const xx = w - (trHist.length - 1 - i) * step; i ? g.lineTo(xx, y(v)) : g.moveTo(xx, y(v)); });
  g.strokeStyle = info_; g.lineWidth = 2; g.stroke();
  g.lineTo(w, pad); g.lineTo(w - (trHist.length - 1) * step, pad); g.closePath();
  g.fillStyle = info_.startsWith('#') ? info_ + '22' : 'rgba(37,99,235,.13)'; g.fill();
}

(function initTravel() {
  // drop focus after the click: keys pressed during the test must not show a focus ring or press Stop (Space / Enter)
  $('trToggle').onclick = e => { setTravelRunning(!trRunning); e.currentTarget.blur(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) setTravelRunning(false); });
  // while testing, keys are pressed to measure them: don't let Space / arrows / Page keys scroll the page
  document.addEventListener('keydown', e => {
    if (trRunning && !e.target.closest('input, select, textarea') && ['Space', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.code)) e.preventDefault();
  });
})();
