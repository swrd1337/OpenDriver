// OpenDriver · protocol.js
// Packet format, command numbers and packet builders. Pure functions, no DOM.

/* =========================================================
   Protocol (see docs/PROTOCOL.md)
   ========================================================= */
const HEAD = 0x5C;
const CMD = { CMD: 0x00, SYNC: 0x01, RM: 0x12, PRGB: 0x18, KEY: 0x23, DB: 0x29, KRGB: 0x2A, DEFKEY: 0x2B };
const CUSTOM_MODE = 21; // PRGB mode for per-key (custom) lighting
const SLEEP = [0, 1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60, 120]; // minutes, 0 = never

function checksum(p) {
  const len = p[1];
  let s = 53 + p[0] + len + p[2];
  if (len > 0 && len <= 252) s += p[len + 3];
  return s & 0xff;
}
function pack(cmd, payload) {
  const p = new Uint8Array(64);
  p[0] = HEAD; p[2] = cmd; p.set(payload, 4); p[1] = payload.length; p[3] = checksum(p);
  return p;
}
const cmdPack = (order, arg) => pack(CMD.CMD, arg == null ? [order, 0xff, 0xff] : [order, arg, 0xff, 0xff]);
const syncPack = () => pack(CMD.SYNC, [1, 2, 3, 4, 0xff, 0xff]);
const dbReadPack = () => pack(CMD.DB, new Array(15).fill(0));
// DB write: global actuation + press/release deadzones, all in µm
const um = mm => Math.max(0, Math.round(mm * 1000));
const dbWritePack = (travel, pressDead, releaseDead) => pack(CMD.DB, [1, 0, 0,
  um(travel) & 0xff, um(travel) >> 8, um(pressDead) & 0xff, um(pressDead) >> 8, um(releaseDead) & 0xff, um(releaseDead) >> 8, 0, 0, 0, 0, 0, 0]);
// per-key performance layers of the KEY command
const L = { DB0: 0x04, MODE: 0x08, RTP: 0x14, RTR: 0x15 };
const PERF_LAYER = { [L.DB0]: 'db0', [L.MODE]: 'mode', [L.RTP]: 'rtp', [L.RTR]: 'rtr' };
// CMD 0x50 value = 1 << index into the board's own rate list. Like the official app, boards whose
// switch type (SYNC n[3]) is 4 only go up to 1 kHz, so for them 1 = 1000 Hz (the AK680 MAX is one of these).
const RATES_FULL = ['8000 Hz', '4000 Hz', '2000 Hz', '1000 Hz', '500 Hz', '250 Hz', '125 Hz'];
const RATES_1K = ['1000 Hz', '500 Hz', '250 Hz', '125 Hz'];
const rateList = () => info.keyType === 4 ? RATES_1K : RATES_FULL;
const rejectedRates = new Set(); // indexes the keyboard refused this session (it replies with its unchanged rate)
function prgbPack(op, s) {
  const p = [op, 0, 0, 0, 0];
  for (const c of s.colors) p.push(c[2], c[1], c[0], 0xff); // B, G, R, FF
  p.push(0, 0, 0, 0, (s.on ? 1 : 0) | (s.dir ? 2 : 0) | (s.superResp ? 16 : 0), s.lum, s.mode, s.speed, s.sleep, s.staticMode);
  return pack(CMD.PRGB, p);
}
// DEFKEY: read two matrix rows (21 columns each) of default key codes
const defkeyPack = (rowA, rowB) => pack(CMD.DEFKEY, [0, rowA, rowB]);
// KEY: up to 14 entries of [key (default code), layer, value]; unused slots padded like the official app
function keyPack(write, entries) {
  const p = [write ? 1 : 0];
  for (let i = 0; i < 14; i++) {
    const e = entries[i];
    if (e) p.push(e[0], e[1], e[2] & 0xff, e[2] >> 8 & 0xff);
    else p.push(...(write ? [0, 0, 0, 0] : [0xff, 0xff, 0xff, 0]));
  }
  return pack(CMD.KEY, p);
}
// KRGB: per-key colors, entries of [key (default code), R, G, B]; bytes after the payload are 0xFF like the official app.
// Reads always carry 14 entries (unused = [FF, 0, 0, 0]); writes carry only the keys being changed.
function krgbPack(write, entries) {
  const list = write ? entries : Array.from({ length: 14 }, (_, i) => entries[i] || [0xff, 0, 0, 0]);
  const payload = [write ? 1 : 0];
  for (const e of list) payload.push(...e);
  const p = pack(CMD.KRGB, payload);
  p.fill(0xff, 4 + payload.length);
  return p;
}
