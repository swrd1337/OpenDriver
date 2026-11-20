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
| `44 + 4·i` | DPI stage color | `[r, g, b, check]`, check = `(0x55 - r - g - b) & 0xFF` |
| `96 + 4·i` | Button *i* action | `[type, param high, param low, check]`, see below |
| `169` | Debounce | 0–15 ms (official default 8; it warns below 8) |
| `171` | Motion sync | 0 = off, 1 = on |
| `173` | Sleep time | 10 s units: 1, 3, 6, 12, 18, 30, 60, 90 (10 s – 15 min) |

Further addresses (angle snapping, ripple control, lighting, shortcut keys at `256`, macros at `768`…) are listed in the driver's `K` table; OpenDriver doesn't touch them.
OpenDriver reads `0..176` on connect.

### DPI stage (PAW3395 / PAW3950)

`v = dpi / 50 - 1` (50–26000 for 3395, 50–30000 for 3950), `h = v >> 8`:

```
[ v & 0xFF,  v & 0xFF,  (h << 2) | (h << 6),  (0x55 - sum of the first 3) & 0xFF ]
  X low      Y low      X / Y high bits          check
```

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
| `4`, `5`, `6`, `8`, `0x0A` | Fire key, shortcut / media, macro, light toggle, DPI lock | not offered by OpenDriver; shown as "Other" |

The official driver refuses to change the last button that does Left click; OpenDriver does the same.
