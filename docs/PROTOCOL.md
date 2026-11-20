# AK680 MAX HID protocol (reverse-engineered)

Source: Ajazz web driver `hj.sparklinkplayjoy.com` (`assets/index-nAeTS8-M.js`), read on 2026-11-20.
Keyboard: magnetic (Hall-effect) switches, firmware `XS135_AK680MAX_App v1.0.0`, ARM Cortex-M + RT-Thread.

**Confirmed by the vendor's own sources (2026-11-20):**
- Docs: https://github.com/sparklinkplayjoy/keyboard-docs (Chinese). `keyboard/` = v1 SDK, usage page `0xFFA0`, **this is the AK680 MAX's**. `keyboardv2/` = newer boards on `0xFFB0`.
- `@sparklinkplayjoy/sdk-keyboard` 1.0.25 (npm, MIT): high-level JS API (`defKey`, `setKey`, `setSingleTravel`, `setRtPressTravel`, ...).
- `@sparklinkplayjoy/protocol-keyboard` 1.0.8 (npm): **readable TypeScript source** of the packet layer:
  `https://cdn.jsdelivr.net/npm/@sparklinkplayjoy/protocol-keyboard@1.0.8/src/` → `constants/byte.ts`, `constants/param.ts`, `utils/pack.ts`, `utils/recdata.ts`.
  Everything below matches it; the sections at the end come from it.

## Transport
- WebHID filter: `vendorId 0x1CA4 (7332)`, `productId 0x0601 (1537)`, `usagePage 0xFFA0`, `usage 0x01` (interface MI_02).
- Host -> device: `device.sendReport(0, packet)`, 64-byte packets (bootloader WRITE uses 256 bytes, sent as 4 x 64).
- Device -> host: input reports; responses are reassembled until `buf[1] <= buf.length`.
  Response command byte = request command + 0x80. Payload `n = buf.slice(4)`.

## Packet layout
| byte | meaning |
|---|---|
| 0 | head = `0x5C` (92) |
| 1 | payload length = (index after last byte) - 4 |
| 2 | command (see below) |
| 3 | checksum |
| 4.. | payload |

Checksum (truncated to 8 bits): `53 + b[0] + b[1] + b[2] + b[b[1] + 3]` (i.e. adds the **last payload byte** only, if 0 < len <= 252).

## Commands (byte 2)
| cmd | name | notes |
|---|---|---|
| 0x00 | CMD | generic query; payload `[order, (arg), 0xFF, 0xFF]` |
| 0x01 | SYNC | payload `01 02 03 04 FF FF`; reply has board ID, SN, fw version, run mode (255 = bootloader) |
| 0x12 | RM6X21 | live travel/ADC matrix (calibration, key test) |
| 0x18 | PRGB | main RGB. payload[0]: 0 = read, 1 = write |
| 0x19 | LOGORGB | logo RGB, same layout as PRGB |
| 0x20 / 0x21 | MACRO / MACROMODE | macros |
| 0x23 | KEY | keymap / per-key layout data (`LayoutDataPack`) |
| 0x24-0x28 | MT / TGL / TDKS(DKS) / DDKS(MPT) / END | advanced keys (mod-tap, toggle, dynamic keystroke, ...) |
| 0x29 | DB | global actuation travel + press/release deadzones |
| 0x2A | KRGB | per-key RGB, 14 keys per packet `[idx, r?, g?, b?]` |
| 0x2B | DEFKEY | read HID matrix rows `[0, rowA, rowB]` |
| 0x2C | SOCD | snap tap |
| 0x2D | RS | rapid trigger |
| 0x08-0x0E | BL_* | **bootloader / firmware flashing. Do not use.** |

### CMD (0x00) orders
1 protocol version · 37 precision & min/max travel · 38 keyboard name · 33/34 query Win/Mac · 48/49 set Win/Mac · 80 polling rate (arg 7) · 112 config ID (arg 4) · 118 switch IDs.

### PRGB payload (after the 4-byte header)
| idx | meaning |
|---|---|
| 0 | 0 read / 1 write |
| 1-4 | 0 |
| 5-32 | 7 colors, each `B, G, R, 0xFF` |
| 33-36 | 0 |
| 37 | flags: bit0 on, bit1 direction, bit4 "super response" |
| 38 | brightness |
| 39 | mode (0 = static, 1-20 = effects, >20 = custom/per-key) |
| 40 | speed |
| 41 | sleep delay |
| 42 | static light mode |

### SYNC reply (n = payload)
`n[1..4]` board ID (u32 LE) · `n[3]` switch type · `n[4]` layout ID · `n[5..6]` hw version · `n[7]` run mode (255 = boot) · `n[9..24]` SN · `n[26..35]` app version string · `n[43..53]` build date.

## Init sequence used by the official app
SYNC → CMD(1) → CMD(38) → CMD(37) → CMD(112,4) → CMD(118) → CMD(80,7) → CMD(33) → CMD(34) → DB read → PRGB read → DEFKEY(0,1), (2,3), (4,5)

---

## From the official protocol source (`protocol-keyboard` 1.0.8)

### Read / write byte
First payload byte of most commands: **`0x00` = read, `0x01` = write** (`bitReadWrite`).

### KEY (0x23): per-key data, up to 14 entries per packet (`MaxPack = 0x0E`)
Payload: `[rw, (key, layer, valueLo, valueHi) × n]`
- `key` = the key's **matrix code** from DEFKEY (not its HID code).
- Reply entries are parsed from `n[i+1..i+4]`; entries with `layer == 0xFF` or `key == 0` are empty.

| layer | meaning | value |
|---|---|---|
| 0x00–0x03 | Fn0–Fn3 keymap layers (UI: "Fn1–Fn4") | key code (table below) |
| 0x04–0x07 | DB0–DB3: per-key actuation point | µm (1200 = 1.20 mm) |
| 0x08 | Mode | `(touchMode << 4) \| advancedKeyMode` |
| 0x09–0x0C | DKS1–4 | DKS key codes |
| 0x0D–0x10 | TRPS1–4: DKS trigger points | µm |
| 0x11 / 0x12 | macro address / size | |
| 0x13 | MT delay | ×10 ms |
| 0x14 / 0x15 | RTP / RTR: rapid-trigger press / release distance | µm |
| 0x16 / 0x17 | DP / DR: per-key press / release deadzone | µm |
| 0x18 | KR: release travel | |
| 0x19 | AXIS: switch type ID | |
| 0x20 | RS | |

`touchMode`: 0 = follow global, 1 = single (fixed actuation), 2 = rapid trigger.
`advancedKeyMode`: 0 none, 1 DKS, 2 MPT, 3 MT, 4 TGL, 5 END, 6 macro, 8 SOCD, 9 RS.

### DEFKEY (0x2B): read the matrix, two rows per request
Request `[0, rowA, rowB]` → reply `n[1]` = rowA, `n[2..22]` = 21 matrix codes; `n[23]` = rowB, `n[24..44]` = 21 codes. `0` = no key. Rows are 0–5, so `(0,1)`, `(2,3)`, `(4,5)` reads the whole board.

### DB (0x29): global actuation + deadzones
Payload `[rw, 0, 0, travelLo, travelHi, pressDeadLo, pressDeadHi, releaseDeadLo, releaseDeadHi, 0×6]`, all in µm.

### CMD (0x00) orders (full list)
| order | meaning |
|---|---|
| 0x01 | protocol version |
| 0x02 / 0x03 | save parameters / reload parameters |
| 0x04 | clear calibration data |
| 0x05 / 0x06 | DKS on / off |
| 0x08 / 0x09 | remapping on / off |
| 0x0A / 0x0B | relative (rapid) trigger on / off |
| 0x0C / 0x0D | start / stop calibration |
| 0x10 | erase macro storage (call before saving macros) |
| 0x11 | **factory reset** (allow > 200 ms) |
| 0x20 | query Win-lock |
| 0x21 / 0x22 | query Win / Mac mode |
| 0x25 | precision + min/max travel (µm; range 0–4000) |
| 0x26 | keyboard name |
| 0x30 / 0x31 | switch to Win / Mac mode |
| 0x34 | top deadzone switch |
| 0x50 | polling rate: 0 = 8 kHz, 1 = 4k, 2 = 2k, 3 = 1k, 4 = 500, 5 = 250, 6 = 125 Hz |
| 0x61 | SOCD quick on/off |
| 0x70 | profile: 0–3 = profile 1–4, other = query |
| 0x75 / 0x76 | current switch type / supported switch IDs |

### Key codes (`keyboard-docs/keyboard/keyboard.md`)
- 4–231: standard USB HID usages (A = 4 … Z = 29, 1–0 = 30–39, Enter 40, Esc 41, Backspace 42, Tab 43, Space 44, F1–F12 = 58–69, arrows 79–82, modifiers 224–231).
- 1 = Fn. Media/consumer: 4277 next, 4278 prev, 4301 play, 4322 mute, 4329/4330 vol±.
- Mouse: 29441 left, 29442 right, 29443 middle, 29448/29449 wheel±.
- Layers: 61441–61443 = Fn1–Fn3. System: 61697 Win mode, 61698 Mac mode, 61699 calibrate, 61704–61708 profiles, 62217 lock Win.
- Lighting: 62224 effect+, 62226/62227 brightness±, 62228/62229 speed±, 62231 lights on/off.

### Keymap flow (as implemented in OpenDriver, mirrors the official app)
1. DEFKEY `(0,1)`, `(2,3)`, `(4,5)` → each key's **default code** and matrix position. The default code is the key's ID in every KEY command.
2. Read each layer: KEY `rw=0`, 14 entries of `[defaultCode, layer, 0, 0]`; unused slots are `FF FF FF 00`.
3. Write one key: KEY `rw=1`, one entry `[defaultCode, layer, valueLo, valueHi]`, other 13 slots `00 00 00 00`; then read it back.
   The official app sends no separate "save" (CMD 0x02); the firmware stores it.
4. **Layer values (confirmed on the real AK680 MAX, 2026-11-20):**
   - Layer index 1 is the **Fn layer** (holds Esc→`, 1–= → F1–F12, Fn+A = Mac mode `0xF102`, Fn+S = Win mode `0xF101`, arrows = lighting).
   - On layers 1–3, value **`1` = transparent** ("same as base", shown as ▽ by the official app). Value `0` = key disabled.
   - Layers 2–3 are all `1` from the factory.
   - **The Fn key's matrix code is `0x01`, but its factory base-layer value is `61441` (`0xF001`, Fn1).** Writing `0x01` there makes Fn dead.
     A "reset to default" must therefore use `0xF001` for that key, not its matrix code. (Bug found and fixed in OpenDriver.)

### Custom per-key lighting (KRGB 0x2A)
Source: `protocol-keyboard` `controller/lighting.ts` + SDK `getCustomLighting` / `setCustomLighting` / `saveCustomLighting`, matched against the official web driver.
1. Turn it on: PRGB write with **mode = 21** (lights on).
2. Read colors: KRGB `rw=0`, always 14 entries `[defaultCode, 0, 0, 0]` (unused: `[FF, 0, 0, 0]`); bytes after the payload are `FF`.
   Reply `n[1..]` = 14 × `[key, R, G, B]`.
3. Write colors: KRGB `rw=1`, 1–14 entries `[defaultCode, R, G, B]`, rest of packet `FF`. Shows on the keyboard immediately.
4. Save: the SDK sends KRGB `rw=1` `[254, 254, 254, 254]` as a "save" command, but **on the AK680 MAX it isn't needed**. Colors written in step 3 survive unplugging (confirmed 2026-11-20). OpenDriver doesn't send it.

### Actuation / performance (as implemented in OpenDriver, mirrors the official app)
- **Global:** DB `rw=1` `[1, 0, 0, travel, pressDead, releaseDead, 0×6]`, each value u16 LE in µm. Read with `rw=0`.
  AK680 MAX (real board): travel 0.02–3.40 mm in 0.02 mm steps (CMD 0x25), factory 1.50 mm, deadzones 0.20 / 0.20 mm. Deadzone sliders in the official app: 0–1 mm, 0.01 steps.
- **Per key** (KEY command, entries `[defaultCode, layer, value]`):
  - Global: `MODE (0x08) = (0 << 4) | adv`
  - Fixed: `MODE = (1 << 4) | adv`, `DB0 (0x04) = actuation µm`
  - Rapid trigger: `MODE = (2 << 4) | adv`, `DB0 = first actuation µm`, `RTP (0x14) = press sensitivity µm`, `RTR (0x15) = release sensitivity µm`
  - `adv` = the existing low nibble (advanced-key type), always preserved.
- **Per-key deadzones** (`DP 0x16` / `DR 0x17`) need protocol ≥ 1.0.1. The AK680 MAX reports **1.0.0**, so only the global deadzones apply.
- **Polling rate:** CMD `0x50` with arg `7` reads it; set it with arg `1 << index`. Reply `n[2]` is `1 << index` into the board's own rate list:
  - switch type (SYNC `n[3]`) **= 4**: `1000 / 500 / 250 / 125 Hz` (so `1` = 1000 Hz). **The AK680 MAX reports type 4**, so its maximum is 1000 Hz.
  - any other type: `8000 / 4000 / 2000 / 1000 / 500 / 250 / 125 Hz`.
  - This is from the official web driver. The SDK documents a plain 0–6 index instead, which doesn't match this board.
  - On the real AK680 MAX (2026-11-20), **250 Hz (`04`) and 125 Hz (`08`) are refused.** The reply is the unchanged rate (`01`).
    The firmware doesn't send an error, so OpenDriver detects a refusal by reading the rate back, then marks that rate "not supported" for the session.

### Live key travel (RM6X21 0x12)
Source: official web driver travel-test page + `protocol-keyboard` `getRm6X21Recdata`.
- Request `[datatype, half, FF, FF]`: datatype **2** = travel. `half` **1** = matrix rows 0–2, **2** = rows 3–5. Alternate the two halves in a loop while the test is open; no start/stop command is needed. Other datatypes: 3 = key status, 6 = raw ADC.
- Reply `0x92` spans **3 HID reports** (the official receiver forces `len = 192` for `0x92` and reassembles them).
  Payload `n[1]` = datatype, then 3 rows × 21 columns of u16 LE in µm starting at `n[2]`. Row/column = the DEFKEY matrix position.
- The reply doesn't say which half it is, so track that yourself from the request.
- OpenDriver polls only while **Live key travel** is running on the Actuation page, stops when you leave the page or hide the tab, and keeps these packets out of the Console log.
