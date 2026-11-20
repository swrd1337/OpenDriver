// OpenDriver · overview.js
// Overview page: device information and stats.

/* =========================================================
   Overview: device information
   ========================================================= */
function renderInfo() {
  const rows = [
    ['Name', info.name], ['Firmware', info.firmware], ['Build date', info.build], ['Protocol', info.protocol],
    ['Serial number', info.serial], ['Board ID', info.board], ['Run mode', info.mode],
    ['Precision', info.precision != null ? info.precision + ' mm' : null],
  ];
  $('info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v != null && v !== '' ? escapeHtml(String(v)) : '<span class="skeleton"></span>'}</dd>`).join('');
  if (info.name) $('kbName').textContent = info.name;
  $('stActuation').textContent = info.actuation != null ? info.actuation.toFixed(2) + ' mm' : '—';
  $('stTravel').textContent = info.travel ? `${info.travel[0].toFixed(1)}–${info.travel[1].toFixed(1)} mm` : '—';
  $('stFirmware').textContent = info.firmware ? info.firmware.replace(/^App\s*/i, '') : '—';
}
