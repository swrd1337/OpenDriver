# Zaopin mouse HID protocol (CompX)

Source: the official Zaopin web driver `https://www.controlhub.top/zaopin/` (`assets/index-D3s0OBtp.js`, `cfg.json`, `sensor.json`, `lang/en.json`), read on 2026-11-20.
It is CompX's shared mouse driver, so other CompX mice (vendor ID `0x3554`) probably speak the same protocol. Only the IDs below are enabled in OpenDriver.

**Not yet confirmed on hardware.** Packets below match the official driver byte for byte (checked by re-typing its builder functions).

## Devices

| | Product IDs (vendor `0x3554`) |
|---|---|
| Wireless (2.4 GHz receiver) | `F524` `F50D` `F527` (Z4D) `F5D5` `F517` |
| Wired | `F526` `F50F` `F511` `F515` |

The settings interface is the HID collection with exactly one input and one output report, both report ID **8**.

## Packet

16 bytes, sent with `sendReport(8, data)`; replies come back on report 8 with the same layout.

```
byte  0     command
byte  1     0 (request) / status in the reply: 0 = OK (1 is also accepted for writes)
bytes 2-3   flash address, big-endian
byte  4     data length (mice; keyboards add 0x80)
bytes 5-14  data
byte  15    checksum: (0x55 - sum(bytes 0..14) - 8) & 0xFF   (the 8 is the report ID)
```

The official driver retries up to 5 times. It treats a reply as matching when bytes 0–2 match the request (bytes 0–4 for reads).

## Commands used

| Cmd | Name | Request | Reply |
|---|---|---|---|
| `0x01` | Handshake ("EncryptionData") | data = 4 random bytes + 4 zero bytes | `[9]` = cid, `[10]` = mid (model), `[11]` = connection type |
| `0x03` | Device online | no data | `[5]` = 1 if the mouse answers through the receiver |
| `0x04` | Battery | no data | `[5]` = level %, `[6]` = 1 while charging, `[7..8]` = voltage (mV, big-endian); if `[9]` = 1, the level is in `[10]` |
| `0x07` | Write flash | address + up to 10 bytes | echo |
| `0x08` | Read flash | address + length (≤ 10) in byte 4 | `[5..]` = data |

Not used and not in the code: `0x09` ClearSetting (factory reset), `0x0B` SetDeviceVidPid, `0x0C` SetDeviceDescriptorString, `0x0D` EnterUsbUpdateMode, `0x11` EnterMTKMode (firmware / identity), pairing commands `0x05`/`0x06`.

Connection type: 0 = wireless 1 kHz, 1 = wireless 4 kHz, 4 = wireless 2 kHz, 5 = wireless 8 kHz, 2 = wired 1 kHz, 3 = wired 8 kHz, 6 = charging base.

## Settings flash

Single-byte settings are stored as a pair `[value, 0x55 - value]`.

| Address | Setting | Values |
|---|---|---|
| `0` | Polling rate | 125 Hz = 8, 250 = 4, 500 = 2, 1000 = 1, 2000 = 16, 4000 = 32, 8000 = 64 (limited by connection type) |
| `2` | Number of DPI stages | 1–8 |
| `4` | Active DPI stage | 0-based index |
| `10` | Lift-off distance | 1 = 1 mm, 2 = 2 mm; PAW3950 also 3 = 0.7 mm |
| `12 + 4·i` | DPI stage *i* (0–7) | see below |
| `76` | DPI indicator effect | 0 off, 1 steady, 2 breathing (turning on also writes `82` = 1) |
| `78` | DPI indicator brightness | levels 1–10 stored as 16, 30, 60, 90, 128, 150, 180, 210, 230, 255 |
| `80` | DPI indicator speed | 1–5 |
| `82` | DPI indicator on | 0 / 1 (off = only this is written) |
| `44 + 4·i` | DPI stage color | `[r, g, b, check]`, check = `(0x55 - r - g - b) & 0xFF` |
| `96 + 4·i` | Button *i* action | `[type, param high, param low, check]`, see below |
| `160` | Light effect record | `[mode, r, g, b, speed 0–9, brightness 0–9, check]`; modes 1 rainbow, 2 single color breathing, 3 fixed color, 4 neon, 5 rainbow breathing, 6 fixed rainbow |
| `167` | Light on | 0 / 1; "Off" only clears this, any other mode sets it and rewrites `160` |
| `169` | Debounce | 0–15 ms (official default 8; it warns below 8) |
| `171` | Motion sync | 0 = off, 1 = on |
| `173` | Sleep time | 10 s units: 1, 3, 6, 12, 18, 30, 60, 90 (10 s – 15 min) |
| `175` | Angle snapping | 0 / 1 |
| `177` | Ripple control | 0 / 1 |
| `179` | Light off while moving | 0 / 1 |
| `256 + 32·i` | Shortcut / media slot for button *i* | see below |
| `768 + 384·i` | Macro slot for button *i* | see below |

Further addresses (sensor mode, wheel settings, 3955 DPI table at `6912`…) are listed in the driver's `K` table; OpenDriver doesn't touch them.
OpenDriver reads `0..181` on connect, then the shortcut or macro slot of each button that uses one.

### DPI stage (PAW3395 / PAW3950)

`v = dpi / 50 - 1` (50–26000 for 3395, 50–30000 for 3950), `h = v >> 8`:

```
[ v & 0xFF,  v & 0xFF,  (h << 2) | (h << 6),  (0x55 - sum of the first 3) & 0xFF ]
  X low      Y low      X / Y high bits          check
```

Separate X / Y values (the driver shows this on PAW3950 models 14–16): byte 0 and the bits 2–3 / bit 0–1 belong to X, byte 1 and bits 6–7 / 4–5 to Y.

Range flags in byte 2: bit 0 doubles the X value, bit 1 doubles it again (bits 4 and 5: Y). The driver ORs in a per-range `DPIex` value from `sensor.json`.
For 3395/3950 that's only the extended range above the sensor maximum, which OpenDriver doesn't offer.

### DPI stage (PAW3311, mid 9)

The stored value comes from the `values` table in `sensor.json` (200 entries, 1…235), indexed by `(dpi - 50) / 50`.
50–10000 DPI: steps of 50, no flags. 10100–12000 DPI: steps of 100, the table is indexed with `dpi / 2` and `DPIex` = `0x22` (×2).
Decoding: find the stored value in the table, `dpi = (index + 1) · 50`, then apply the ×2 flags.

### Model → sensor (cid 7 = Zaopin)

| mid | Sensor | Max DPI |
|---|---|---|
| 1, 2, 3, 7, 10, 11, 12, 13 | PAW3395 | 26000 |
| 4, 5, 6, 8, 14, 15, 16 | PAW3950 | 30000 |
| 9 | PAW3311 | 12000 |

## Connect sequence (official driver)

1. Open the report-8 interface.
2. Handshake (`0x01`) → cid / mid / type.
3. Device online (`0x03`), polled every 1.5 s until the mouse is awake.
4. Read flash `0..256` in 10-byte chunks (OpenDriver reads only `0..44`).

## Removing a DPI stage

There is no command for it, and the official driver only lowers the stage count, which drops the last stages.
OpenDriver removes stage *i* (never stage 1) with the same writes: it rewrites the DPI and color of stages *i*…*n*−2 with those of the stages after them, writes count *n*−1, then moves the active stage down by one if it was at or after *i*.

## Buttons

Six slots, in flash order (cfg.json `keys`): 0 left, 1 right, 2 wheel, 3 back, 4 forward, 5 DPI button.
Defaults: `1:0x0100`, `1:0x0200`, `1:0x0400`, `1:0x0800`, `1:0x1000`, `2:0x0100`.

| Type | Meaning | Param |
|---|---|---|
| `0` | Disabled | 0 |
| `1` | Mouse button | `0x0100` left, `0x0200` right, `0x0400` wheel, `0x0800` back, `0x1000` forward |
| `2` | DPI | `0x0100` cycle, `0x0200` up, `0x0300` down |
| `3` | Horizontal scroll | `0x0100` left, `0x0200` right |
| `0x0B` | Vertical scroll | `0x0100` up, `0x0200` down |
| `7` | Polling rate switch | 0 |
| `4` | Fire key | `interval << 8 \| clicks`: interval 10–255 ms, clicks 0–3 (0 = while held); driver default 10 ms × 3 |
| `5` | Shortcut or media key | 0; the keys are in the button's shortcut slot |
| `6` | Macro | `button << 8 \| repeat`: repeat 1–250 times, 254 until released, 253 until pressed again, 255 until any button |
| `8` | Light toggle | `0x0000` all lights, `0x0100` DPI indicator, `0x0300` light strip, `0x0400` cycle strip effects |
| `0x0A` | DPI lock | the DPI's stored value (as in a DPI stage), **low byte first** |

### Shortcut and media slot (`256 + 32·i`)

```
[count = 2 × keys, presses: (type | 0x80, value low, value high)…, releases in reverse order: (type | 0x40, …)…, check]
```

Up to 5 keys fit the 32-byte slot. Event types: 0 = modifier (bit mask: 1 Ctrl, 2 Shift, 4 Alt, 8 Win, ×16 for the right-hand ones), 1 = key (HID usage), 2 = consumer usage (media).
A media key is a one-key shortcut of type 2, e.g. volume up: `02 82 E9 00 42 E9 00 check`.

### Macro slot (`768 + 384·i`)

```
[name length (1–30), UTF-8 name, 0xFF padding up to byte 30, event count (≤ 70), events…, check]
event = [(0x80 press | 0x40 release) | type, value low, value high, delay high, delay low]   (delay in ms, big-endian)
check = (0x55 - sum of the event bytes - count) & 0xFF
```

Event types as above, plus 4 = mouse button (1 left, 2 right, 4 wheel, 8 back, 16 forward).
A slot whose name length isn't 1–30 or whose count is over 70 is treated as empty, like the driver does.

The official driver refuses to change the last button that does Left click; OpenDriver does the same, also for imported backups.
When a button needs a slot, OpenDriver writes the slot first and the button record second, so the button never points at stale data.

## Checking the encoders

`node tools/check-mouse.js` compares every record builder in `js/mouse.js` and `js/mouse-buttons.js` with re-typed copies of the driver's own functions (all DPI values of each sensor, X/Y, colors, buttons, media, shortcuts, macros, packet splitting and checksums).
