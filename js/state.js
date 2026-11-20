// OpenDriver · state.js
// Shared state (device, keymap, colors, performance) and small helpers.

/* =========================================================
   State
   ========================================================= */
const $ = id => document.getElementById(id);
const demo = new URLSearchParams(location.search).has('demo');
let dev = null, rx = new Uint8Array(0), light = null, connected = false;
const info = {};
let matrixRows = [];                               // matrixRows[row] = [{ code, col }]
const keymap = [new Map(), new Map(), new Map(), new Map()]; // keymap[layer].get(defaultCode) = assigned code
const keyColors = new Map();  // defaultCode -> [r, g, b], as currently on the keyboard
let savedColors = new Map();  // colors as read on connect, for "Undo changes"
let ckDirty = false;
const perf = { mode: new Map(), db0: new Map(), rtp: new Map(), rtr: new Map() }; // per key, values as stored (µm / mode byte)
const logRows = [];

const hex = a => [...a].map(b => b.toString(16).padStart(2, '0')).join(' ');
const txt = a => new TextDecoder().decode(new Uint8Array([...a].filter(b => b && b !== 0xff))).trim();
const toHex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
const fromHex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const wait = ms => new Promise(r => setTimeout(r, ms));
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
