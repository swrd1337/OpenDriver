// OpenDriver · lighting.js
// Lighting page: groups, static presets, dynamic effects, brightness/speed/sleep.

/* =========================================================
   Lighting view
   ========================================================= */
const group = () => !light || !light.on ? 0 : light.mode === 0 ? 1 : light.mode <= 20 ? 2 : 3;

function renderLighting() {
  $('lightEmpty').hidden = !!light; $('lightContent').hidden = !light;
  if (!light) return;
  const g = group();
  document.querySelectorAll('#groupSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.group === g)));
  $('grpOff').hidden = g !== 0; $('grpStatic').hidden = g !== 1; $('grpDynamic').hidden = g !== 2; $('grpCustom').hidden = g !== 3;
  renderCustom();

  const sw = $('swatches');
  if (!sw.children.length) {
    for (let i = 0; i < 8; i++) {
      const b = document.createElement('button');
      b.className = 'swatch' + (i === 7 ? ' multi' : '');
      b.setAttribute('aria-label', i === 7 ? 'Preset 8, multicolor' : `Preset ${i + 1}`);
      b.onclick = () => { light.staticMode = i; writeLight(); };
      sw.appendChild(b);
    }
  }
  [...sw.children].forEach((b, i) => {
    if (i < 7) b.style.setProperty('--sw', toHex(light.colors[i]));
    b.setAttribute('aria-pressed', String(light.staticMode === i));
  });
  const sm = light.staticMode;
  $('presetLabel').textContent = sm === 7 ? 'Preset 8 · Multicolor' : `Preset ${sm + 1} of 8`;
  $('colorEdit').hidden = sm >= 7;
  if (sm < 7) { $('colorPick').value = toHex(light.colors[sm]); $('colorHex').textContent = toHex(light.colors[sm]).toUpperCase(); }

  const ef = $('effects');
  if (!ef.children.length) {
    for (let i = 1; i <= 20; i++) {
      const b = document.createElement('button');
      b.className = 'effect'; b.textContent = String(i).padStart(2, '0'); b.setAttribute('aria-label', `Effect ${i}`);
      b.onclick = () => { light.mode = i; writeLight(); };
      ef.appendChild(b);
    }
  }
  [...ef.children].forEach((b, i) => b.setAttribute('aria-pressed', String(light.mode === i + 1)));
  $('effectLabel').textContent = light.mode >= 1 && light.mode <= 20 ? `Effect ${light.mode} of 20` : '';

  setRange('lum', light.lum); setRange('speed', light.speed);
  $('dir').checked = light.dir;
  const sel = $('sleep');
  if (!sel.options.length) for (const m of SLEEP) sel.add(new Option(m === 0 ? 'Never' : m < 60 ? `${m} min` : `${m / 60} h`, m));
  sel.value = SLEEP.includes(light.sleep) ? light.sleep : 0;

  renderPreview();
}
function setRange(id, v) {
  const r = $(id); r.value = v; r.style.setProperty('--p', (v / 4 * 100) + '%');
  $(id + 'V').textContent = `${v} / 4`;
}


/* =========================================================
   Lighting controls
   ========================================================= */
document.querySelectorAll('#groupSeg button').forEach(b => b.onclick = () => {
  if (!light) return;
  const g = +b.dataset.group;
  if (g === 0) light.on = false;
  if (g === 1) { light.on = true; light.mode = 0; }
  if (g === 2) { light.on = true; if (!(light.mode >= 1 && light.mode <= 20)) light.mode = 1; }
  if (g === 3) { light.on = true; light.mode = CUSTOM_MODE; if (!keyColors.size) readColors(); }
  writeLight();
});
$('colorPick').oninput = e => { light.colors[light.staticMode] = fromHex(e.target.value); renderLighting(); };
$('colorPick').onchange = () => writeLight();
for (const id of ['lum', 'speed']) {
  $(id).oninput = e => { setRange(id, +e.target.value); light[id] = +e.target.value; renderPreview(); };
  $(id).onchange = () => writeLight();
}
$('dir').onchange = e => { light.dir = e.target.checked; writeLight(); };
$('sleep').onchange = e => { light.sleep = +e.target.value; writeLight(); };
