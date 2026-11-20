// OpenDriver · mouse-lighting.js
// Mouse decorative light (flash 160..167, 179) and DPI indicator (76..82), written like the official driver.

const MS_LIGHT_MODES = [[0, 'Off'], [1, 'Rainbow'], [2, 'Single color breathing'], [3, 'Fixed color'], [4, 'Neon'], [5, 'Rainbow breathing'], [6, 'Fixed rainbow']];
const MS_LIGHT_COLOR_MODES = [2, 3];
const MS_DPI_FX = [[0, 'Off'], [1, 'Steady'], [2, 'Breathing']];

// Off only clears the on flag; any other mode sets it and writes [mode, r, g, b, speed, brightness, check].
async function msWriteLight(l) {
  if (l.on && l.mode) {
    await msWrite(MS_ADDR.LIGHT_STATE, msPair(1));
    await msWrite(MS_ADDR.LIGHT, msRecord([l.mode, ...l.color, l.speed, l.bright]));
  } else await msWrite(MS_ADDR.LIGHT_STATE, msPair(0));
  if (l.movingOff != null) await msWrite(MS_ADDR.MOVING_OFF, msPair(l.movingOff ? 1 : 0));
}
async function msWriteDpiFx(f) {
  if (f.on && f.mode) { await msWrite(MS_ADDR.DPI_FX_MODE, msPair(f.mode)); await msWrite(MS_ADDR.DPI_FX_STATE, msPair(1)); }
  else await msWrite(MS_ADDR.DPI_FX_STATE, msPair(0));
  await msWrite(MS_ADDR.DPI_FX_BRIGHT, msPair(fxBrightToByte(f.bright)));
  await msWrite(MS_ADDR.DPI_FX_SPEED, msPair(f.speed));
}
const lightEquals = (a, b) => a.on === b.on && (!a.on || a.mode === b.mode && toHex(a.color) === toHex(b.color) && a.speed === b.speed && a.bright === b.bright) && a.movingOff === b.movingOff;
const fxEquals = (a, b) => a.on === b.on && (!a.on || a.mode === b.mode) && a.bright === b.bright && a.speed === b.speed;

function msSetLight(change, text) {
  const l = { ...ms.light, ...change };
  if (change.mode != null) l.on = change.mode !== 0;
  msApply(() => msWriteLight(l), () => lightEquals(ms.light, l), text, 'The light did not change.');
}
function msSetDpiFx(change, text) {
  const f = { ...ms.dpiFx, ...change };
  if (change.mode != null) f.on = change.mode !== 0;
  msApply(() => msWriteDpiFx(f), () => fxEquals(ms.dpiFx, f), text, 'The DPI indicator did not change.');
}

// Range value + the filled part of the track (--p), like the keyboard's sliders. shown = the number displayed.
function msRange(id, v, shown = v) {
  const r = $(id); r.value = v;
  r.style.setProperty('--p', ((v - r.min) / (r.max - r.min) * 100) + '%');
  $(id + 'V').textContent = shown;
}
function renderMsLighting() {
  const l = ms.light, f = ms.dpiFx, mode = l.on ? l.mode : 0, fxMode = f.on ? f.mode : 0;
  msSelect($('msLightMode'), MS_LIGHT_MODES, mode, v => `Mode ${v}`);
  $('msLightColorRow').hidden = !MS_LIGHT_COLOR_MODES.includes(mode);
  $('msLightColor').value = toHex(l.color);
  $('msLightLevels').hidden = !mode;
  msRange('msLightBright', l.bright, l.bright + 1); msRange('msLightSpeed', l.speed, l.speed + 1); // stored 0-9, shown 1-10 like the driver
  $('msMovingOff').checked = l.movingOff;
  msSelect($('msDpiFxMode'), MS_DPI_FX, fxMode, v => `Mode ${v}`);
  $('msDpiFxLevels').hidden = !fxMode;
  msRange('msDpiFxBright', f.bright);
  $('msDpiFxSpeedRow').hidden = fxMode !== 2;
  msRange('msDpiFxSpeed', f.speed);
}

$('msLightMode').onchange = e => { const v = +e.target.value; msSetLight({ mode: v }, `Light effect: ${MS_LIGHT_MODES.find(m => m[0] === v)[1].toLowerCase()}.`); };
$('msLightColor').onchange = e => msSetLight({ color: fromHex(e.target.value) }, 'Light color updated.');
$('msLightBright').onchange = e => msSetLight({ bright: +e.target.value }, `Light brightness is ${+e.target.value + 1}.`);
$('msLightSpeed').onchange = e => msSetLight({ speed: +e.target.value }, `Light speed is ${+e.target.value + 1}.`);
$('msLightBright').oninput = e => msRange('msLightBright', +e.target.value, +e.target.value + 1);
$('msLightSpeed').oninput = e => msRange('msLightSpeed', +e.target.value, +e.target.value + 1);
$('msMovingOff').onchange = e => msSetLight({ movingOff: e.target.checked }, e.target.checked ? 'The light now turns off while moving.' : 'The light now stays on while moving.');
$('msDpiFxMode').onchange = e => { const v = +e.target.value; msSetDpiFx({ mode: v }, `DPI indicator: ${MS_DPI_FX.find(m => m[0] === v)[1].toLowerCase()}.`); };
$('msDpiFxBright').onchange = e => msSetDpiFx({ bright: +e.target.value }, `DPI indicator brightness is ${e.target.value}.`);
$('msDpiFxSpeed').onchange = e => msSetDpiFx({ speed: +e.target.value }, `DPI indicator speed is ${e.target.value}.`);
$('msDpiFxBright').oninput = e => msRange('msDpiFxBright', +e.target.value);
$('msDpiFxSpeed').oninput = e => msRange('msDpiFxSpeed', +e.target.value);
