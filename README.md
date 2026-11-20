# OpenDriver

An open, browser-based configuration tool for the **Ajazz AK680 MAX** magnetic (Hall-effect) keyboard.
Nothing to install: it runs in Chrome or Edge and talks to the keyboard directly over [WebHID](https://developer.mozilla.org/docs/Web/API/WebHID_API).

**Use it:** https://swrd1337.github.io/OpenDriver/
**Try it without a keyboard:** https://swrd1337.github.io/OpenDriver/?demo

> OpenDriver is an independent project. It is not affiliated with, endorsed by, or supported by Ajazz or Sparklink.
> It uses the same commands as the official web driver, but you use it at your own risk.

## Features

| Page | What you can do |
|---|---|
| **Overview** | Device name, firmware, serial, actuation and travel range, plus a live lighting preview |
| **Lighting** | Off / Static (8 presets, editable colors) / Dynamic (20 effects) / Custom; brightness, speed, direction and sleep timer |
| **Custom lighting** | Paint every key its own color: click or drag, color picker and swatches, presets (fill, WASD + arrows, rainbow, off), undo |
| **Keymap** | Remap any key on the Base, Fn, Fn2 and Fn3 layers: letters, modifiers, F-keys, media, mouse, lighting and system keys; reset the base layer or factory-reset |
| **Actuation** | Global actuation point and deadzones, polling rate, per-key Global / Fixed / Rapid trigger, live key travel test with a depth gauge and chart |
| **Mouse** | Zaopin Z2 / Z4D: DPI stages (count, values, separate X / Y where supported, colors, active stage, remove any stage but the first); buttons (clicks, scroll, DPI, fire key, DPI lock, media keys, shortcuts, recorded macros); polling rate, lift-off, debounce, motion sync, angle snapping, ripple control, sleep time; lighting and DPI indicator; battery level; restore defaults per section; reconnects automatically |
| **Console** | Every packet sent and received by the keyboard and the mouse, filterable per device, for debugging and protocol work |
| **Backup** | Export the keyboard's or the mouse's settings to a JSON file and import them again (Overview → Device information, Mouse → Export / Import). Imported files are checked before anything is written. |

Light and dark themes, works on narrow screens, respects "reduce motion".

## Requirements

- **Chrome or Edge** (desktop). Firefox and Safari don't support WebHID.
- The keyboard connected **by USB cable**, in wired mode.
- Close the official Ajazz web driver first: only one page can use the keyboard at a time.
- On **Linux**, your user needs access to the device's `hidraw` nodes. Add a udev rule, then replug:

  ```
  echo 'KERNEL=="hidraw*", ATTRS{idVendor}=="1ca4", ATTRS{idProduct}=="0601", TAG+="uaccess"' | sudo tee /etc/udev/rules.d/70-ajazz-ak680.rules
  echo 'KERNEL=="hidraw*", ATTRS{idVendor}=="3554", TAG+="uaccess"' | sudo tee /etc/udev/rules.d/70-zaopin-mouse.rules
  sudo udevadm control --reload && sudo udevadm trigger
  ```

After the first connect, OpenDriver **reconnects by itself**: when you reload the page or plug the keyboard back in. Click **Disconnect** to stop that.
It uses Chrome's remembered permission for the site, so it works best on the hosted page. A copy opened from disk may ask again.

## Running it locally

No build step and no dependencies. Either:

- open `index.html` directly from disk, or
- serve the folder with any static server, for example `python -m http.server 8000`, and open http://localhost:8000.

Add `?demo` to the address to use a simulated keyboard.

## Safety

- OpenDriver **never sends firmware-update / bootloader commands**. Those packets aren't even in the code.
- **Factory reset** is only available behind an explicit confirmation on the Keymap page.
- Everything else (keymap, lighting, actuation) can be changed back at any time, or restored with a factory reset.

## Project structure

```
index.html            page markup
favicon.svg           site icon
css/styles.css        all styles (shadcn/ui-style zinc tokens, light + dark)
js/
  protocol.js         packet format, command numbers, packet builders (no DOM)
  state.js            shared state and helpers
  transport.js        WebHID send/receive, reply parsing, read-on-connect
  demo.js             simulated keyboard for ?demo
  keycodes.js         key code catalog for the picker and keycaps
  keyboard.js         layout + on-screen keyboard builder, Overview preview
  overview.js         Overview page
  lighting.js         Lighting page
  custom-lighting.js  per-key RGB editor
  keymap.js           Keymap page, layers, reset dialog
  actuation.js        Actuation page
  travel.js           live key travel test
  mouse.js            Mouse page: Zaopin Z2 / Z4D protocol, transport and core settings
  mouse-buttons.js    mouse button actions, shortcuts, media keys and the macro editor
  mouse-lighting.js   mouse light effect and DPI indicator
  backup.js           settings export / import (both devices), mouse restore defaults
  shell.js            console, toasts, navigation, theme
  main.js             connect / disconnect and start-up (loaded last)
docs/PROTOCOL.md      the keyboard's HID protocol, as far as it is known
docs/MOUSE-PROTOCOL.md  the Zaopin (CompX) mouse protocol
tools/check-mouse.js  checks the mouse record encoders (node tools/check-mouse.js)
```

The scripts are plain classic scripts loaded in that order (no bundler, no ES modules), so the page also works from `file://`.

## The protocol

[docs/PROTOCOL.md](docs/PROTOCOL.md) documents the keyboard's vendor HID protocol: packet layout, checksum, commands, keymap layers, lighting, actuation, polling rate and the live travel stream.
It was worked out from the official web driver and the vendor's public docs ([sparklinkplayjoy/keyboard-docs](https://github.com/sparklinkplayjoy/keyboard-docs)), then checked against a real keyboard.

[docs/MOUSE-PROTOCOL.md](docs/MOUSE-PROTOCOL.md) covers the Zaopin mice, worked out from Zaopin's official web driver.

Other keyboards built on the same Sparklink platform (vendor ID `0x1CA4`, usage page `0xFFA0`) probably speak the same protocol, but only the AK680 MAX has been tested.

## Contributing

Issues and pull requests are welcome. Before changing protocol code, read [AGENTS.md](AGENTS.md): it lists the rules that keep the tool safe for people's keyboards, and how to test with `?demo`.
When reporting a bug, include the packet log from the **Console** page (**Copy log**).

## License

[MIT](LICENSE)
