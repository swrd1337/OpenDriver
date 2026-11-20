// OpenDriver · tools/check-keyboard.js
// Checks the keyboard packet builders in js/protocol.js against re-typed copies of the vendor's own builders:
// @sparklinkplayjoy/protocol-keyboard 1.0.8 (MIT), src/utils/index.ts (computeCRC, createProtocol) and
// src/utils/pack.ts + src/controller/*.ts (CMDPack, SYNCPack, KeyDataPack, DBDataPack, PRGBDatapack, cmdKRGB).
// Run: node tools/check-keyboard.js   (no dependencies; exits 1 on any mismatch)

const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { info: { keyType: 4 } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'protocol.js'), 'utf8') +
  ';Object.assign(this,{HEAD,CMD,pack,cmdPack,syncPack,dbReadPack,dbWritePack,keyPack,krgbPack,prgbPack,defkeyPack,um,L})', ctx);

// --- vendor, re-typed ---
const HeadByte = 0x5c;
const computeCRC = (len, cmd, data) => { let crc = 0x35 + HeadByte + len + cmd; if (len > 0 && len <= 63 * 4) crc += data[data.length - 1]; return crc; };
function createProtocol(len, cmd, data) { const p = new Uint8Array(64).fill(0); [HeadByte, len, cmd, computeCRC(len, cmd, data), ...data].forEach((v, i) => p[i] = v); return p; }
const lohi = v => [v & 0xff, v >> 8 & 0xff];
const vCMD = (order, hArgs = []) => createProtocol(hArgs.length + 3, 0x00, [order, ...hArgs, 0xff, 0xff]);
const vSYNC = () => createProtocol(6, 0x01, [1, 2, 3, 4, 0xff, 0xff]);
const vKEY = (rw, keys) => { const d = [rw ? 1 : 0, ...keys.flatMap(({ key, layout, value }) => [key, layout, value ? value & 0xff : 0, value ? value >> 8 & 0xff : 0])]; return createProtocol(d.length, 0x23, d); };
const vDB = (rw, g = 0, p = 0, r = 0) => { const d = [rw ? 1 : 0, 0, 0, ...lohi(g), ...lohi(p), ...lohi(r), 0, 0, 0, 0, 0, 0]; return createProtocol(d.length, 0x29, d); };
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
function vPRGB(rw, l) { // version 1.0.7: no dynamic color id
  const data = [];
  for (const s of l.colors.map(hex).slice(0, 7)) data.push(parseInt(s.substring(5, 7), 16), parseInt(s.substring(3, 5), 16), parseInt(s.substring(1, 3), 16), 0xff);
  const bitmap = (l.on ? 1 : 0) | (l.dir ? 2 : 0) | (l.superResp ? 16 : 0);
  const d = [rw ? 1 : 0, 0, 0, 0, 0, ...data, 0, 0, 0, 0, bitmap, l.lum, l.mode, l.speed, l.sleep, l.staticMode];
  return createProtocol(d.length, 0x18, d);
}
function vKRGB(rw, descs) {
  const rgb = descs.flatMap(({ key, r, g, b }) => [key, r, g, b]), data = [rw ? 1 : 0, ...rgb], len = data.length;
  const protocol = Array.from(createProtocol(len, 0x2A, data));
  const fill = new Array(59 - rgb.length).fill(0xff);
  protocol.splice(len + 4, fill.length);
  return Uint8Array.from([...protocol, ...fill]);
}

// --- checks ---
let fails = 0, checks = 0;
const eq = (a, b) => a.length === b.length && [...a].every((x, i) => (x & 255) === (b[i] & 255));
function check(name, got, want) { checks++; if (!eq(got, want)) { fails++; if (fails <= 20) console.log(`FAIL ${name}\n  got  ${[...got].join(' ')}\n  want ${[...want].join(' ')}`); } }
function same(name, got, want) { checks++; if (got !== want) { fails++; if (fails <= 20) console.log(`FAIL ${name}: got ${got}, want ${want}`); } }

check('SYNC', ctx.syncPack(), vSYNC());
for (const order of [1, 37, 38, 0x11]) check(`CMD ${order}`, ctx.cmdPack(order), vCMD(order));
for (const [order, arg] of [[0x50, 7], [0x50, 1], [0x50, 64]]) check(`CMD ${order} ${arg}`, ctx.cmdPack(order, arg), vCMD(order, [arg]));
check('DB read', ctx.dbReadPack(), vDB(false));
for (const [t, p, r] of [[1.5, 0.2, 0.2], [0.1, 0, 0], [3.6, 1, 0.55], [1.234, 0.001, 0.999]])
  check(`DB write ${t}/${p}/${r}`, ctx.dbWritePack(t, p, r), vDB(true, ctx.um(t), ctx.um(p), ctx.um(r)));
// KEY: full 14-entry packets are byte-identical; OpenDriver pads shorter ones like the official web app
const keys14 = Array.from({ length: 14 }, (_, i) => [4 + i, i % 4, i === 3 ? 0xF001 : i === 5 ? 1 : 0x1E + i]);
for (const rw of [true, false]) check(`KEY ${rw ? 'write' : 'read'} 14 entries`, ctx.keyPack(rw, keys14), vKEY(rw, keys14.map(([key, layout, value]) => ({ key, layout, value }))));
const short = ctx.keyPack(true, [[20, 1, 0x29]]);
check('KEY short write: first entry', short.slice(4, 9), [1, 20, 1, 0x29, 0]);
check('KEY short write: padding is zeros', short.slice(9, 61), new Array(52).fill(0));
check('KEY short read: padding is FF FF FF 00', ctx.keyPack(false, [[20, 1, 0]]).slice(9, 13), [0xff, 0xff, 0xff, 0]);
same('KEY length byte = 57', short[1], 57);
for (const l of [
  { colors: [[255, 59, 48], [255, 149, 0], [255, 214, 10], [52, 199, 89], [0, 199, 190], [10, 132, 255], [255, 55, 95]], on: true, dir: false, superResp: false, lum: 3, mode: 0, speed: 2, sleep: 5, staticMode: 5 },
  { colors: Array(7).fill([0, 0, 0]), on: false, dir: true, superResp: true, lum: 0, mode: 21, speed: 4, sleep: 120, staticMode: 7 },
]) for (const op of [0, 1]) check(`PRGB op ${op} mode ${l.mode}`, ctx.prgbPack(op, l), vPRGB(op === 1, l));
const krgbWrite = [[4, 255, 0, 0], [26, 0, 255, 0], [44, 1, 2, 3]];
check('KRGB write', ctx.krgbPack(true, krgbWrite), vKRGB(true, krgbWrite.map(([key, r, g, b]) => ({ key, r, g, b }))));
const krgbRead = Array.from({ length: 14 }, (_, i) => [4 + i, 0, 0, 0]);
check('KRGB read 14 entries', ctx.krgbPack(false, krgbRead), vKRGB(false, krgbRead.map(([key, r, g, b]) => ({ key, r, g, b }))));
// framing of every builder: header, length, checksum over head + length + cmd + last payload byte
for (const p of [ctx.defkeyPack(0, 1), ctx.defkeyPack(4, 5), ctx.cmdPack(38), short]) {
  same('header 0x5C', p[0], ctx.HEAD);
  same('checksum', p[3], (0x35 + 0x5c + p[1] + p[2] + p[3 + p[1]]) & 0xff);
}

console.log(fails ? `${fails} of ${checks} checks failed` : `All ${checks} checks passed`);
process.exit(fails ? 1 : 0);
