// OpenDriver · keymap.js
// Keymap page: layers, key picker, remapping and reset.

/* =========================================================
   Keymap view
   ========================================================= */
// name of a physical key (by its matrix code), as printed on the keycap
const physName = c => c === 1 ? 'Fn' : keyName(c);
const LAYER_NAMES = ['Base layer', 'Fn layer', 'Fn2 layer', 'Fn3 layer'];
const LAYER_PREFIX = ['', 'Fn + ', 'Fn2 + ', 'Fn3 + '];
const LAYER_KEY = [0, 61441, 61442, 61443]; // the key code that, held down, switches to that layer
// which keys (base or Fn layer) are set to open layer `ly`
function layerTriggers(ly) {
  const out = [];
  for (const k of layoutRows().flat()) {
    if (assigned(0, k) === LAYER_KEY[ly]) out.push(physName(k));
    else if (ly > 1 && assigned(1, k) === LAYER_KEY[ly]) out.push('Fn + ' + physName(k));
  }
  return out;
}
let kmLayer = 0, kmSel = null, kmGroup = 'Basic', kmQuery = '';

const assigned = (ly, code) => keymap[ly].has(code) ? keymap[ly].get(code) : null;
// factory default per layer: base = the key's own code (Fn key = Fn1); Fn layers = "same as base"
const layerDefault = (ly, code) => ly > 0 ? TRANSPARENT : code === 1 ? FN1 : code;
const isChanged = (ly, code, v) => v != null && v !== layerDefault(ly, code);

function renderKeymap() {
  $('kmEmpty').hidden = connected; $('kmContent').hidden = !connected;
  if (!connected) return;
  document.querySelectorAll('#layerSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.layer === kmLayer)));
  $('kmLayerTitle').textContent = LAYER_NAMES[kmLayer];

  let loaded = 0, changed = 0;
  $('kmKb').querySelectorAll('.key').forEach(k => {
    const code = +k.dataset.code, v = assigned(kmLayer, code);
    if (v != null) loaded++;
    const shown = v ?? layerDefault(kmLayer, code);
    const ch = isChanged(kmLayer, code, v);
    if (ch) changed++;
    k.textContent = shown === 44 ? 'Space' : keyShort(shown, kmLayer);
    k.title = `${LAYER_PREFIX[kmLayer]}${physName(code)} → ${keyName(shown, kmLayer)}`;
    k.classList.toggle('changed', ch);
    k.classList.toggle('empty', shown === 0 || (kmLayer > 0 && shown === TRANSPARENT));
    k.setAttribute('aria-pressed', String(code === kmSel));
  });
  $('kmLegend').textContent = !loaded ? 'Reading keymap…'
    : kmLayer === 0 ? (changed ? `${changed} key${changed === 1 ? '' : 's'} remapped · blue keys differ from the default` : 'No keys remapped on this layer.')
    : (() => {
        const t = layerTriggers(kmLayer);
        const how = t.length ? `Hold ${t.join(' or ')} to use this layer.`
          : `No key opens this layer yet: on the base layer, set a key to “${LAYER_NAMES[kmLayer].replace(' layer', '')}” (Modifiers).`;
        const what = changed ? `${changed} key${changed === 1 ? '' : 's'} with their own action, ▽ = same as base.` : 'Every key does the same as on the base layer (▽).';
        return `${how} ${what}`;
      })();

  renderSelection();
  renderPicker();
}

function renderSelection() {
  const el = $('kmSel');
  if (kmSel == null) {
    el.innerHTML = `<div><h2 style="margin:0;font-size:15px;font-weight:600">Choose a key</h2><p style="margin:2px 0 0;color:var(--muted-fg);font-size:13px">Click a key on the keyboard above to change what it does on the ${LAYER_NAMES[kmLayer].toLowerCase()}.</p></div>`;
    return;
  }
  const v = assigned(kmLayer, kmSel) ?? layerDefault(kmLayer, kmSel);
  const def = layerDefault(kmLayer, kmSel);
  el.innerHTML = `
    <div class="sel-main">
      <span class="cap"></span>
      <svg viewBox="0 0 24 24" class="i" style="color:var(--muted-fg)"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      <span class="cap to"></span>
      <div style="min-width:0"><div class="field-label" id="kmSelName"></div><div class="field-hint" id="kmSelHint"></div></div>
    </div>
    <button class="btn btn-outline btn-sm" id="kmReset">
      <svg viewBox="0 0 24 24" class="i"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg><span></span>
    </button>`;
  const caps = el.querySelectorAll('.cap');
  caps[0].textContent = kmSel === 44 ? 'Space' : kmSel === 1 ? 'Fn' : keyShort(kmSel);
  caps[1].textContent = v === 44 ? 'Space' : keyShort(v, kmLayer);
  $('kmSelName').textContent = LAYER_PREFIX[kmLayer] + physName(kmSel);
  $('kmSelHint').textContent = `${LAYER_NAMES[kmLayer]} · ` + (kmLayer > 0 && v === TRANSPARENT ? 'does the same as on the base layer' : 'sends ' + keyName(v, kmLayer));
  const reset = $('kmReset');
  reset.querySelector('span').textContent = kmLayer === 0 ? 'Restore default' : 'Same as base';
  reset.disabled = v === def;
  reset.onclick = () => assignKey(def);
}

function renderPicker() {
  const chips = $('kmChips');
  if (!chips.children.length) for (const g of GROUPS) {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = g; b.dataset.g = g;
    b.onclick = () => { kmGroup = g; kmQuery = ''; $('kmSearch').value = ''; renderPicker(); };
    chips.appendChild(b);
  }
  [...chips.children].forEach(b => b.setAttribute('aria-pressed', String(!kmQuery && b.dataset.g === kmGroup)));

  const q = kmQuery.trim().toLowerCase();
  const list = q ? KC.filter(k => k.l.toLowerCase().includes(q) || k.s.toLowerCase().includes(q) || k.g.toLowerCase().includes(q)) : KC.filter(k => k.g === kmGroup);
  const cur = kmSel == null ? null : assigned(kmLayer, kmSel) ?? layerDefault(kmLayer, kmSel);
  const codes = $('kmCodes');
  codes.innerHTML = '';
  if (!list.length) { codes.innerHTML = '<div class="empty-note" style="grid-column:1/-1">No keys match your search.</div>'; return; }
  for (const k of list) {
    const b = document.createElement('button');
    b.className = 'code'; b.title = k.l;
    b.innerHTML = k.s !== k.l ? `<span></span><small></small>` : '<span></span>';
    b.querySelector('span').textContent = k.s;
    if (k.s !== k.l) b.querySelector('small').textContent = k.l;
    b.setAttribute('aria-current', String(k.c === cur));
    b.disabled = kmSel == null;
    b.onclick = () => assignKey(k.c);
    codes.appendChild(b);
  }
}

function selectKey(code) { kmSel = kmSel === code ? null : code; renderKeymap(); }

async function assignKey(value) {
  if (kmSel == null) return;
  const key = kmSel, ly = kmLayer;
  keymap[ly].set(key, value);
  renderKeymap();
  try {
    await send(keyPack(true, [[key, ly, value]]));
    await send(keyPack(false, [[key, ly, 0]])); // read back to confirm
    toast('Key updated', ly > 0 && value === TRANSPARENT
      ? `${LAYER_PREFIX[ly]}${physName(key)} now does the same as on the base layer.`
      : `${LAYER_PREFIX[ly]}${physName(key)} now sends ${keyName(value, ly)}.`);
  } catch (e) { toast('Could not update key', e.message, true); }
}

/* ---------- reset ---------- */
let resetBusy = false;
async function resetBaseLayer() {
  const keys = layoutRows().flat().filter(k => assigned(0, k) !== layerDefault(0, k));
  if (!keys.length) { toast('Nothing to reset', 'The base layer already matches the defaults.'); return; }
  for (let i = 0; i < keys.length; i += 14) await send(keyPack(true, keys.slice(i, i + 14).map(k => [k, 0, layerDefault(0, k)])));
  keys.forEach(k => keymap[0].set(k, layerDefault(0, k)));
  renderKeymap();
  for (let i = 0; i < keys.length; i += 14) await send(keyPack(false, keys.slice(i, i + 14).map(k => [k, 0, 0])), 8); // read back
  toast('Base layer reset', `${keys.length} key${keys.length === 1 ? '' : 's'} restored to default.`);
}
async function factoryReset() {
  await send(cmdPack(0x11));   // ORDER_TYPE_RESTORE_FACTORY_SETTINGS; firmware needs > 200 ms
  await wait(800);
  kmSel = null;
  await readAll();
  toast('Keyboard reset', 'All settings are back to factory defaults.');
}
$('kmResetBtn').onclick = () => {
  if (resetBusy) return;
  $('resetDlg').querySelector('input[value="base"]').checked = true;
  $('resetConfirm').textContent = 'Reset base layer';
  $('resetDlg').showModal();
};
$('resetDlg').addEventListener('change', e => {
  $('resetConfirm').textContent = e.target.value === 'factory' ? 'Factory reset' : 'Reset base layer';
});
$('resetDlg').addEventListener('close', async () => {
  const dlg = $('resetDlg');
  if (dlg.returnValue !== 'ok' || resetBusy) return;
  const scope = dlg.querySelector('input[name="scope"]:checked').value;
  resetBusy = true; $('kmResetBtn').disabled = true;
  try { scope === 'factory' ? await factoryReset() : await resetBaseLayer(); }
  catch (e) { toast('Reset failed', e.message, true); }
  finally { resetBusy = false; $('kmResetBtn').disabled = false; }
});

document.querySelectorAll('#layerSeg button').forEach(b => b.onclick = () => { kmLayer = +b.dataset.layer; renderKeymap(); });
$('kmSearch').oninput = e => { kmQuery = e.target.value; renderPicker(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && kmSel != null && $('page-keymap').classList.contains('active')) { kmSel = null; renderKeymap(); } });
