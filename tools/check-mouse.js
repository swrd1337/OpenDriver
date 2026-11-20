// OpenDriver · tools/check-mouse.js
// Checks the mouse record encoders against re-typed copies of the official Zaopin driver's builders
// (controlhub.top/zaopin, assets/index-D3s0OBtp.js: Ac, ll, ul, xl/hl, mie, gie, fae, pae, mae, Al, vl, Sl/Cl).
// Run: node tools/check-mouse.js   (no dependencies; exits 1 on any mismatch)

const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const cut = (file, until) => { const s = fs.readFileSync(path.join(root, file), 'utf8'); return s.slice(0, s.indexOf(until)); };
// Only the pure parts: protocol constants and encoders. No DOM, no device.
const ctx = { navigator: { platform: 'Linux' }, TextEncoder, TextDecoder };
vm.createContext(ctx);
vm.runInContext(cut('js/mouse.js', '/* =========================================================\n   Transport') +
  cut('js/mouse-buttons.js', '// Button i\'s 3 record bytes') +
  ';Object.assign(this,{msPack,msPair,msRecord,dpiEncode,dpiDecode,dpiDecodeY,fxBrightToByte,fxBrightFromByte,shortcutRecord,macroRecord,parseMacro,MS_3311})', ctx);

// --- official driver, re-typed (mouse: jc() = 0, zs = report id 8) ---
const zs = 8;
const Ac = e => { let t = 0; for (let n = 0; n < e.length - 1; n++) t += e[n]; t &= 255; return 85 - t; };
const u8 = a => Uint8Array.from(a);
function ll(e, t) { const n = Uint8Array.of(7, 0, e >> 8, e & 255, 2, 8, 77, 0, 0, 0, 0, 0, 0, 0, 0, 239); n[4] = 2; n[5] = t; n[6] = 85 - t; n[15] = Ac(n) - zs; return n; }
function ul(e, t) { const n = Uint8Array.of(8, 0, e >> 8, e & 255, t, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 239); n[4] = t; n[15] = Ac(n) - zs; return n; }
function cl(e, t) { const out = []; const chunks = Math.ceil(t.length / 10); for (let a = 0; a < chunks; a++) { const n = Uint8Array.of(7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 239), o = e + a * 10, s = Math.min(10, t.length - a * 10); n[2] = o >> 8; n[3] = o & 255; n[4] = s; for (let c = 0; c < 10; c++) n[5 + c] = c < s ? t[c + a * 10] : 0; n[15] = Ac(n) - zs; out.push(n); } return out; }
const RANGES = { 3395: [{ min: 50, step: 50, DPIex: 0 }], 3950: [{ min: 50, step: 50, DPIex: 0 }], 3311: [{ min: 50, step: 50, DPIex: 0 }, { min: 10100, step: 100, DPIex: 34 }] };
function xl(e, sensor) {
  const range = RANGES[sensor]; let i; for (i = range.length - 1; i >= 0 && !(e >= range[i].min); i--);
  const n = range[i].DPIex, r = i === 1 ? 2 : 1; let t = e / r;
  if (sensor === '3311') t = ctx.MS_3311[(t - range[0].min) / range[0].step]; else t = t / range[0].step - 1;
  return { val: t, dpiEx: n };
}
function mie(x, y, sensor) { const o = xl(x, sensor), s = xl(y, sensor), a = Uint8Array.of(o.val, s.val, 0, 0), c = o.val >> 8, l = s.val >> 8; a[2] = c << 2 | l << 6 | o.dpiEx | s.dpiEx << 4; a[3] = Ac(a); return a; }
const gie = c => { const a = Uint8Array.of(...c, 0); a[3] = Ac(a); return a; };
const fae = (type, param) => { const n = Uint8Array.of(type, param >> 8, param & 255, 0); n[3] = Ac(n); return n; };
function pae(m) { const i = [2, 130, m & 255, m >> 8, 66, m & 255, m >> 8, 0]; i[7] = Ac(i); return u8(i); }
function mae(keys) { const i = [keys.length * 2]; for (const s of keys) i.push(s.type | 128, s.value & 255, s.value >> 8 & 255); for (const s of keys.slice().reverse()) i.push(s.type | 64, s.value & 255, s.value >> 8 & 255); i.push(0); i[i.length - 1] = Ac(i); return u8(i); }
function Al(name, events) {
  const r = new TextEncoder().encode(name), i = new Uint8Array(33 + events.length * 5).fill(255); i[0] = r.length; r.forEach((b, j) => i[j + 1] = b); i[31] = events.length;
  const a = []; for (const e of events) a.push(((e.down ? 2 : 1) << 6) + e.type, e.value & 255, e.value >> 8, e.delay >> 8, e.delay & 255);
  a.push(0); a[a.length - 1] = Ac(a) - events.length; a.forEach((b, j) => i[32 + j] = b); return i;
}
const Sl = e => { switch (e) { case 1: return 16; case 2: case 3: case 4: case 6: case 7: case 8: return 30 * (e - 1); case 5: return 128; case 9: return 230; case 10: return 255; default: return 128; } };

// --- checks ---
let fails = 0, checks = 0;
const eq = (a, b) => a.length === b.length && [...a].every((x, i) => (x & 255) === (b[i] & 255));
function check(name, got, want) { checks++; if (!eq(got, want)) { fails++; if (fails <= 20) console.log(`FAIL ${name}\n  got  ${[...got]}\n  want ${[...want]}`); } }
function same(name, got, want) { checks++; if (got !== want) { fails++; if (fails <= 20) console.log(`FAIL ${name}: got ${got}, want ${want}`); } }
const writeOf = (addr, rec) => ctx.msPack(7, addr, rec);

for (const [a, v] of [[0, 1], [0, 64], [2, 8], [4, 0], [10, 3], [169, 15], [173, 90], [82, 1], [78, 255]]) check(`setting @${a}=${v}`, writeOf(a, ctx.msPair(v)), ll(a, v));
for (const [a, n] of [[0, 10], [170, 10], [180, 1], [256, 10], [800, 6]]) check(`read @${a}+${n}`, ctx.msPack(8, a, [], n), ul(a, n));
const dpiList = s => { // every DPI the page can store on each sensor
  const out = [], max = { 3395: 26000, 3950: 30000, 3311: 10000 }[s];
  for (let d = 50; d <= max; d += 50) out.push(d);
  if (s === '3311') for (let d = 10100; d <= 12000; d += 100) out.push(d);
  return out;
};
for (const s of ['3395', '3950', '3311']) for (const d of dpiList(s)) {
  const rec = ctx.dpiEncode(d, s);
  check(`DPI ${d} on ${s}`, rec, mie(d, d, s));
  same(`DPI ${d} on ${s} decodes`, ctx.dpiDecode(rec, s), d);
}
for (const [x, y] of [[400, 26000], [30000, 50], [1600, 800], [12750, 12800]]) {
  const rec = ctx.dpiEncode(x, '3950', y);
  check(`XY ${x}x${y}`, rec, mie(x, y, '3950'));
  same(`XY ${x}x${y} X`, ctx.dpiDecode(rec, '3950'), x); same(`XY ${x}x${y} Y`, ctx.dpiDecodeY(rec, '3950'), y);
}
check('color record', ctx.msRecord([12, 200, 77]), gie([12, 200, 77]));
for (const [t, p] of [[1, 0x1000], [0xB, 0x200], [2, 0x300], [7, 0], [0, 0], [8, 0x400], [4, 10 << 8 | 3]]) check(`button ${t}:${p}`, ctx.msRecord([t, p >> 8, p & 255]), fae(t, p));
for (const m of [0xCD, 0xE9, 0x183, 0x22A]) check(`media ${m}`, ctx.shortcutRecord([{ type: 2, value: m }]), pae(m));
const combos = [[{ type: 0, value: 1 }, { type: 1, value: 6 }], [{ type: 0, value: 8 }, { type: 0, value: 2 }, { type: 1, value: 22 }], [{ type: 0, value: 1 }, { type: 0, value: 2 }, { type: 0, value: 4 }, { type: 0, value: 8 }, { type: 1, value: 69 }]];
for (const c of combos) { const r = ctx.shortcutRecord(c); check(`shortcut ${c.length} keys`, r, mae(c)); same(`shortcut ${c.length} keys fits 32 bytes`, r.length <= 32, true); }
const macros = [
  ['Copy', [{ down: true, type: 0, value: 1, delay: 12 }, { down: true, type: 1, value: 6, delay: 30 }, { down: false, type: 1, value: 6, delay: 5 }, { down: false, type: 0, value: 1, delay: 10 }]],
  ['Klick ü', [{ down: true, type: 4, value: 1, delay: 300 }, { down: false, type: 4, value: 1, delay: 65535 }]],
  ['Long', Array.from({ length: 70 }, (_, i) => ({ down: i % 2 === 0, type: 1, value: 4 + (i >> 1) % 26, delay: i * 37 }))],
];
for (const [name, events] of macros) {
  const rec = ctx.macroRecord({ name, events });
  check(`macro ${name}`, rec, Al(name, events));
  same(`macro ${name} fits its 384-byte slot`, rec.length <= 384, true);
  const back = ctx.parseMacro(rec.slice(0, 32), rec.slice(32));
  same(`macro ${name} parses back`, JSON.stringify(back), JSON.stringify({ name, events }));
}
for (let b = 1; b <= 10; b++) { same(`DPI indicator brightness ${b}`, ctx.fxBrightToByte(b), Sl(b)); same(`DPI indicator brightness ${b} back`, ctx.fxBrightFromByte(Sl(b)), b); }
// multi-packet writes split exactly like the driver's cl()
const big = ctx.macroRecord({ name: macros[0][0], events: macros[0][1] }), split = [];
for (let i = 0; i < big.length; i += 10) split.push(ctx.msPack(7, 768 + i, big.slice(i, i + 10)));
cl(768, big).forEach((p, i) => check(`macro packet ${i}`, split[i], p));
// every packet's checksum: sum of all 16 bytes + report id = 0x55
for (const p of [...split, ctx.msPack(1, 0, [9, 8, 7, 6, 0, 0, 0, 0]), ctx.msPack(4)]) same('checksum', ([...p].reduce((a, b) => a + b, 0) + 8) & 255, 85);

console.log(fails ? `${fails} of ${checks} checks failed` : `All ${checks} checks passed`);
process.exit(fails ? 1 : 0);
