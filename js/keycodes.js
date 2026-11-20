// OpenDriver · keycodes.js
// Key code catalog (labels, groups) used by the keymap picker and keycaps.

/* =========================================================
   Key codes (keyboard-docs/keyboard/keyboard.md)
   ========================================================= */
const KC = [], KCMAP = new Map();
const GROUPS = ['Basic', 'Modifiers', 'Function', 'Numpad', 'Media', 'Mouse', 'Lighting', 'System'];
function addKeys(g, list) { for (const [c, l, s] of list) { const k = { c, l, s: s || l, g }; KC.push(k); KCMAP.set(c, k); } }
addKeys('Basic', [
  ...Array.from({ length: 26 }, (_, i) => [4 + i, String.fromCharCode(65 + i)]),
  ...Array.from({ length: 10 }, (_, i) => [30 + i, String((i + 1) % 10)]),
  [40, 'Enter'], [41, 'Escape', 'Esc'], [42, 'Backspace', 'Bksp'], [43, 'Tab'], [44, 'Space'],
  [45, 'Minus', '-'], [46, 'Equals', '='], [47, 'Left bracket', '['], [48, 'Right bracket', ']'], [49, 'Backslash', '\\'],
  [51, 'Semicolon', ';'], [52, 'Quote', "'"], [53, 'Grave', '`'], [54, 'Comma', ','], [55, 'Period', '.'], [56, 'Slash', '/'],
  [57, 'Caps Lock', 'Caps'],
]);
addKeys('Modifiers', [
  [224, 'Left Ctrl', 'Ctrl'], [225, 'Left Shift', 'Shift'], [226, 'Left Alt', 'Alt'], [227, 'Left Win', 'Win'],
  [228, 'Right Ctrl', 'Ctrl'], [229, 'Right Shift', 'Shift'], [230, 'Right Alt', 'Alt'], [231, 'Right Win', 'Win'],
  [61441, 'Fn (hold for the Fn layer)', 'Fn'], [61442, 'Fn2 (hold for the Fn2 layer)', 'Fn2'], [61443, 'Fn3 (hold for the Fn3 layer)', 'Fn3'],
]);
addKeys('Function', [
  ...Array.from({ length: 12 }, (_, i) => [58 + i, 'F' + (i + 1)]),
  ...Array.from({ length: 12 }, (_, i) => [104 + i, 'F' + (i + 13)]),
  [70, 'Print Screen', 'PrtSc'], [71, 'Scroll Lock', 'ScrLk'], [72, 'Pause'], [73, 'Insert', 'Ins'], [74, 'Home'],
  [75, 'Page Up', 'PgUp'], [76, 'Delete', 'Del'], [77, 'End'], [78, 'Page Down', 'PgDn'],
  [79, 'Right arrow', '→'], [80, 'Left arrow', '←'], [81, 'Down arrow', '↓'], [82, 'Up arrow', '↑'], [101, 'Menu'],
]);
addKeys('Numpad', [
  [83, 'Num Lock', 'NumLk'], [84, 'Numpad /', 'N /'], [85, 'Numpad *', 'N *'], [86, 'Numpad -', 'N -'], [87, 'Numpad +', 'N +'],
  [88, 'Numpad Enter', 'N Ent'], ...Array.from({ length: 9 }, (_, i) => [89 + i, 'Numpad ' + (i + 1), 'N ' + (i + 1)]),
  [98, 'Numpad 0', 'N 0'], [99, 'Numpad .', 'N .'],
]);
addKeys('Media', [
  [4301, 'Play / Pause', 'Play'], [4277, 'Next track', 'Next'], [4278, 'Previous track', 'Prev'], [4279, 'Stop media', 'Stop'],
  [4322, 'Mute', 'Mute'], [4329, 'Volume up', 'Vol +'], [4330, 'Volume down', 'Vol −'], [4483, 'Media player', 'Media'],
  [4490, 'Email', 'Mail'], [4498, 'Calculator', 'Calc'], [4500, 'File explorer', 'Files'], [4641, 'Search'],
  [4643, 'Web browser', 'Web'], [4767, 'Show desktop', 'Desk'], [4207, 'Screen brightness up', 'Scr +'], [4208, 'Screen brightness down', 'Scr −'],
]);
addKeys('Mouse', [
  [29441, 'Left click', 'LMB'], [29442, 'Right click', 'RMB'], [29443, 'Middle click', 'MMB'],
  [29444, 'Move left', 'M ←'], [29445, 'Move right', 'M →'], [29446, 'Move up', 'M ↑'], [29447, 'Move down', 'M ↓'],
  [29448, 'Wheel up', 'Whl ↑'], [29449, 'Wheel down', 'Whl ↓'],
]);
addKeys('Lighting', [
  [62231, 'Lights on / off', 'Light'], [62224, 'Next effect', 'Fx +'], [62255, 'Previous effect', 'Fx −'], [62225, 'Effect direction', 'Dir'],
  [62226, 'Brightness up', 'Bri +'], [62227, 'Brightness down', 'Bri −'], [62228, 'Speed up', 'Spd +'], [62229, 'Speed down', 'Spd −'],
]);
addKeys('System', [
  [61697, 'Windows mode', 'WinM'], [61698, 'Mac mode', 'MacM'], [62217, 'Lock Win key', 'LkWin'], [61707, 'Swap WASD / arrows', 'WASD'],
  [61704, 'Profile 1', 'Prof 1'], [61705, 'Profile 2', 'Prof 2'], [61706, 'Profile 3', 'Prof 3'], [61708, 'Profile 4', 'Prof 4'],
  [62265, 'Snap Tap on', 'Snap'],
]);
// Raw matrix code 1 is the Fn key's ID, but as a value on the base layer it does nothing (not offered in the picker).
KCMAP.set(1, { c: 1, l: 'Fn without a layer (does nothing)', s: 'Fn ✕', g: 'Hidden' });
// On the Fn layers (1-3) the value 1 means "transparent": the key does what it does on the base layer.
const TRANSPARENT = 1;
const FN1 = 61441; // the Fn key's real factory function (its matrix code is 1, which on its own does nothing)
const keyShort = (c, ly = 0) => ly > 0 && c === TRANSPARENT ? '▽' : c === 0 ? '—' : KCMAP.get(c)?.s ?? '0x' + c.toString(16).toUpperCase();
const keyName = (c, ly = 0) => ly > 0 && c === TRANSPARENT ? 'same as base layer' : c === 0 ? 'nothing (disabled)' : KCMAP.get(c)?.l ?? 'code 0x' + c.toString(16).toUpperCase();
