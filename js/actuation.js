// OpenDriver · actuation.js
// Actuation page: global actuation, deadzones, polling rate, per-key modes.

/* =========================================================
   Actuation view
   ========================================================= */
const TOUCH = { GLOBAL: 0, FIXED: 1, RT: 2 };
const TOUCH_NAMES = ['Global', 'Fixed', 'Rapid trigger'];
const acSel = new Set();
let acMode = TOUCH.FIXED;
const acVals = { travel: 1.2, rtFirst: 0.5, rtp: 0.3, rtr: 0.3 };
const touchOf = k => ((perf.mode.get(k) ?? 0) >> 4) & 0x0f;
const advOf = k => (perf.mode.get(k) ?? 0) & 0x0f;
const travelRange = () => ({ min: info.travel?.[0] || 0.1, max: info.travel?.[1] || 4, step: info.precision || 0.01 });
const mm = v => v.toFixed(2) + ' mm';

function setMmRange(id, v, min, max, step) {
  const r = $(id); r.min = min; r.max = max; r.step = step; r.value = v;
  r.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%');
  const lab = $(id + 'V'); if (lab) lab.textContent = mm(v);
}

function renderPerf() {
  const ok = connected && info.actuation != null;
  $('acEmpty').hidden = ok; $('acContent').hidden = !ok;
  if (!ok) return;
  const { min, max, step } = travelRange();

  // global
  const act = $('acTravel');
  if (document.activeElement !== act) setMmRange('acTravel', info.actuation, min, max, step);
  $('acTravelMin').textContent = mm(min); $('acTravelMax').textContent = mm(max);
  if (document.activeElement !== $('acPd')) setMmRange('acPd', info.pressDead ?? 0, 0, 1, 0.01);
  if (document.activeElement !== $('acRd')) setMmRange('acRd', info.releaseDead ?? 0, 0, 1, 0.01);
  renderTravelViz(+act.value);

  // polling rate
  const sel = $('acRate');
  const list = rateList();
  const sig = list.join() + '|' + [...rejectedRates].join();
  if (sel.dataset.list !== sig) {
    sel.innerHTML = '';
    list.forEach((r, i) => { const o = new Option(rejectedRates.has(i) ? `${r} (not supported)` : r, i); o.disabled = rejectedRates.has(i); sel.add(o); });
    sel.dataset.list = sig;
  }
  if (info.rate != null && info.rate >= 0 && info.rate < list.length) sel.value = info.rate;
  $('acRateHint').textContent = `Up to ${list[0]} on this keyboard.`;

  // per-key keyboard
  const counts = [0, 0, 0];
  $('acKb').querySelectorAll('.key').forEach(k => {
    const code = +k.dataset.code, t = touchOf(code);
    counts[t] = (counts[t] || 0) + 1;
    const label = code === 44 ? 'Space' : code === 1 ? 'Fn' : keyShort(code);
    const sub = t === TOUCH.FIXED ? ((perf.db0.get(code) ?? 0) / 1000).toFixed(2) : t === TOUCH.RT ? 'RT' : '';
    k.innerHTML = '<span></span><small></small>';
    k.firstChild.textContent = label; k.lastChild.textContent = sub;
    k.classList.toggle('m-fixed', t === TOUCH.FIXED);
    k.classList.toggle('m-rt', t === TOUCH.RT);
    k.setAttribute('aria-pressed', String(acSel.has(code)));
    k.title = `${physName(code)} · ${TOUCH_NAMES[t] || 'Global'}` + (t === TOUCH.FIXED ? ' ' + mm((perf.db0.get(code) ?? 0) / 1000) : '');
  });
  $('acLegend').textContent = perf.mode.size
    ? `${counts[0]} global · ${counts[1]} fixed · ${counts[2]} rapid trigger. Click or drag across keys to select them.`
    : 'Reading per-key settings…';
  renderPerfSelection();
}

function renderTravelViz(v) {
  const { max } = travelRange();
  const pct = Math.min(100, Math.max(0, v / max * 100)) + '%';
  $('acVizFill').style.setProperty('--p', pct); $('acVizMark').style.setProperty('--p', pct);
  $('acVizLabel').textContent = mm(v);
}

function renderPerfSelection() {
  const el = $('acSel');
  const n = acSel.size;
  if (!n) { el.innerHTML = '<div class="field-hint" style="text-align:center;padding:8px 0">Select one or more keys above to change how they actuate.</div>'; return; }
  const { min, max, step } = travelRange();
  el.innerHTML = `
    <div class="field-row" style="margin-bottom:16px;flex-wrap:wrap">
      <div><div class="field-label">${n} key${n === 1 ? '' : 's'} selected</div><div class="field-hint" id="acSelHint"></div></div>
      <div class="seg" role="group" aria-label="Key mode" id="acModeSeg" style="min-width:300px">
        <button data-m="0">Global</button><button data-m="1">Fixed</button><button data-m="2">Rapid trigger</button>
      </div>
    </div>
    <div id="acModeBody"></div>
    <div class="ac-apply"><button class="btn btn-primary" id="acApply">Apply to ${n} key${n === 1 ? '' : 's'}</button></div>`;
  el.querySelectorAll('#acModeSeg button').forEach(b => {
    b.setAttribute('aria-pressed', String(+b.dataset.m === acMode));
    b.onclick = () => { acMode = +b.dataset.m; renderPerfSelection(); };
  });
  const body = $('acModeBody');
  const slider = (id, label, hint) => `
    <div class="field">
      <div class="field-row"><div><label class="field-label" for="${id}">${label}</label><div class="field-hint">${hint}</div></div><span class="value" id="${id}V"></span></div>
      <input type="range" id="${id}">
    </div>`;
  if (acMode === TOUCH.GLOBAL) body.innerHTML = `<div class="field-hint">These keys will use the global actuation point (${mm(info.actuation)}).</div>`;
  if (acMode === TOUCH.FIXED) body.innerHTML = `<div class="ac-sel-grid">${slider('acKeyTravel', 'Actuation point', 'How far down the key registers.')}</div>`;
  if (acMode === TOUCH.RT) body.innerHTML = `<div class="ac-sel-grid">
      ${slider('acRtFirst', 'First actuation', 'Where the first press registers.')}
      <div style="display:grid;gap:20px">
        ${slider('acRtp', 'Press sensitivity', 'How little the key must move down to re-press.')}
        ${slider('acRtr', 'Release sensitivity', 'How little the key must move up to release.')}
      </div></div>`;
  const bind = (id, key) => {
    if (!$(id)) return;
    setMmRange(id, acVals[key], min, max, step);
    $(id).oninput = e => { acVals[key] = +e.target.value; setMmRange(id, acVals[key], min, max, step); };
  };
  bind('acKeyTravel', 'travel'); bind('acRtFirst', 'rtFirst'); bind('acRtp', 'rtp'); bind('acRtr', 'rtr');
  const modes = new Set([...acSel].map(touchOf));
  $('acSelHint').textContent = modes.size === 1 ? `Currently ${TOUCH_NAMES[[...modes][0]] || 'Global'}` : 'Currently a mix of modes';
  $('acApply').onclick = applyPerf;
}

// load the slider values from the first selected key
function loadSelectionValues() {
  const k = [...acSel][0];
  if (k == null) return;
  const t = touchOf(k);
  acMode = t <= 2 ? t : TOUCH.FIXED;
  if (perf.db0.has(k)) { acVals.travel = perf.db0.get(k) / 1000; acVals.rtFirst = perf.db0.get(k) / 1000; }
  if (perf.rtp.has(k)) acVals.rtp = perf.rtp.get(k) / 1000;
  if (perf.rtr.has(k)) acVals.rtr = perf.rtr.get(k) / 1000;
}

async function applyPerf() {
  const keys = [...acSel];
  const entries = [];
  for (const k of keys) {
    const mode = (acMode << 4) | advOf(k);
    entries.push([k, L.MODE, mode]); perf.mode.set(k, mode);
    if (acMode === TOUCH.FIXED) { entries.push([k, L.DB0, um(acVals.travel)]); perf.db0.set(k, um(acVals.travel)); }
    if (acMode === TOUCH.RT) {
      entries.push([k, L.DB0, um(acVals.rtFirst)], [k, L.RTP, um(acVals.rtp)], [k, L.RTR, um(acVals.rtr)]);
      perf.db0.set(k, um(acVals.rtFirst)); perf.rtp.set(k, um(acVals.rtp)); perf.rtr.set(k, um(acVals.rtr));
    }
  }
  renderPerf();
  try {
    for (let i = 0; i < entries.length; i += 14) await send(keyPack(true, entries.slice(i, i + 14)));
    await readPerf(keys); // read back
    toast('Actuation updated', `${keys.length} key${keys.length === 1 ? '' : 's'} set to ${TOUCH_NAMES[acMode]}` +
      (acMode === TOUCH.FIXED ? ` at ${mm(acVals.travel)}.` : acMode === TOUCH.RT ? ` (${mm(acVals.rtp)} / ${mm(acVals.rtr)}).` : '.'));
  } catch (e) { toast('Could not update actuation', e.message, true); }
}

let acGlobalTimer = 0;
function writeGlobal() {
  clearTimeout(acGlobalTimer);
  acGlobalTimer = setTimeout(async () => {
    try {
      await send(dbWritePack(info.actuation, info.pressDead ?? 0, info.releaseDead ?? 0));
      await send(dbReadPack());
      toast('Global actuation updated', `${mm(info.actuation)} · deadzones ${mm(info.pressDead ?? 0)} / ${mm(info.releaseDead ?? 0)}`);
    } catch (e) { toast('Could not update actuation', e.message, true); }
  }, 150);
}

(function initPerf() {
  $('acTravel').oninput = e => { const v = +e.target.value; const r = travelRange(); setMmRange('acTravel', v, r.min, r.max, r.step); renderTravelViz(v); };
  $('acTravel').onchange = e => { info.actuation = +e.target.value; renderInfo(); writeGlobal(); };
  $('acPd').oninput = e => setMmRange('acPd', +e.target.value, 0, 1, 0.01);
  $('acPd').onchange = e => { info.pressDead = +e.target.value; writeGlobal(); };
  $('acRd').oninput = e => setMmRange('acRd', +e.target.value, 0, 1, 0.01);
  $('acRd').onchange = e => { info.releaseDead = +e.target.value; writeGlobal(); };
  $('acRate').onchange = async e => {
    const i = +e.target.value;
    try {
      await send(cmdPack(0x50, 1 << i)); await send(cmdPack(0x50, 7)); await wait(60);
      if (info.rate === i) toast('Polling rate updated', `Now ${rateList()[i]}.`);
      else {
        rejectedRates.add(i); renderPerf();
        toast('Rate not supported', `This keyboard doesn't accept ${rateList()[i]}. It stays at ${rateList()[info.rate] ?? 'its current rate'}.`, true);
      }
    }
    catch (err) { toast('Could not change polling rate', err.message, true); }
  };
  document.querySelectorAll('[data-acsel]').forEach(b => b.onclick = () => {
    const all = layoutRows().flat();
    acSel.clear();
    if (b.dataset.acsel === 'all') all.forEach(k => acSel.add(k));
    if (b.dataset.acsel === 'wasd') [26, 4, 22, 7].filter(k => all.includes(k)).forEach(k => acSel.add(k));
    loadSelectionValues(); renderPerf();
  });

  // click / drag to select keys
  const kb = $('acKb');
  let dragging = false, adding = true, last = null;
  const toggle = (code, on) => { if (on) acSel.add(code); else acSel.delete(code); };
  kb.addEventListener('pointerdown', e => {
    const k = e.target.closest('.key'); if (!k || e.button !== 0) return;
    e.preventDefault();
    const code = +k.dataset.code;
    dragging = true; last = k; adding = !acSel.has(code);
    kb.setPointerCapture(e.pointerId);
    const wasEmpty = !acSel.size;
    toggle(code, adding);
    if (wasEmpty) loadSelectionValues();
    renderPerf();
  });
  kb.addEventListener('pointermove', e => {
    if (!dragging) return;
    const k = document.elementFromPoint(e.clientX, e.clientY)?.closest('#acKb .key');
    if (k && k !== last) { last = k; toggle(+k.dataset.code, adding); renderPerf(); }
  });
  const stop = () => { dragging = false; last = null; };
  kb.addEventListener('pointerup', stop); kb.addEventListener('pointercancel', stop);
})();
