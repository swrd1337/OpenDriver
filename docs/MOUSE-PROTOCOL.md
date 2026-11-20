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
| `44 + 4·i` | DPI stage color | not used yet |

Further addresses (debounce, motion sync, sleep time, buttons, macros…) are listed in the driver's `K` table; OpenDriver doesn't touch them.

### DPI stage (PAW3395 / PAW3950)

`v = dpi / 50 - 1` (50–26000 for 3395, 50–30000 for 3950), `h = v >> 8`:

```
[ v & 0xFF,  v & 0xFF,  (h << 2) | (h << 6),  (0x55 - sum of the first 3) & 0xFF ]
  X low      Y low      X / Y high bits          check
```

Bit 0 of byte 2 doubles the X value (bit 4: Y); the driver sets it for the extended range above the sensor maximum, which OpenDriver doesn't offer.
Other sensors (for example PAW3311, mid 9) use lookup tables and are read-only in OpenDriver.

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
OpenDriver removes stage *i* (never stage 1) with the same writes: it rewrites stages *i*…*n*−2 with the values of the stages after them, writes count *n*−1, then moves the active stage down by one if it was at or after *i*. Stage colors (`44 + 4·i`) are not shifted.
