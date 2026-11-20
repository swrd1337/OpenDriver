# AGENTS.md

Guide for AI coding agents (and humans) working on OpenDriver.

## What this is

A static web app that configures the Ajazz AK680 MAX keyboard over WebHID. No framework, no build, no dependencies.
Hosted on GitHub Pages from the repository root.

## Layout and load order

`index.html` loads `css/styles.css` and then the scripts in `js/` **in this order**:

```
protocol → state → transport → demo → keycodes → keyboard → overview → lighting
→ custom-lighting → keymap → actuation → travel → shell → main
```

- They are **classic scripts, not ES modules**, so the page works from `file://` (users open it straight from disk). Don't switch to `type="module"` or `import`/`export`.
- Classic scripts share one global scope. Top-level `const`/`let`/`function` in one file are visible to the files after it.
- Code that runs **at load time** may only use things from earlier files. Code inside functions and event handlers can use anything, because everything is loaded by the time it runs.
- `main.js` is last and does start-up rendering.

When adding a file, add its `<script>` tag in the right place and list it in README.md's project structure.

## Testing

There is no test runner. Test in a browser:

1. Serve the folder: `python -m http.server 8000`, then open `http://localhost:8000/?demo`.
2. `?demo` swaps WebHID for a simulated keyboard (`js/demo.js`) that answers every command OpenDriver sends: keymap, colors, actuation, live travel.
3. Click **Connect keyboard**, then go through the page you changed, check the **Console** page for the packets, and check the browser console for errors.
4. When you add a new command, teach `demoReply()` in `js/demo.js` to answer it, so the feature can be tested without hardware.

Hardware testing is done by the maintainer. Ask for the packet log (Console → **Copy log**) rather than guessing what the keyboard did.

## Protocol rules (read before touching protocol or write code)

The full reference is [docs/PROTOCOL.md](docs/PROTOCOL.md). These rules exist because breaking them can leave someone's keyboard misconfigured:

- **Never send bootloader / firmware commands** (`0x08`–`0x0E`). They are deliberately absent from the code. Don't add them.
- **Match the official app's packets byte for byte.** Before adding a command, find how the official web driver or the vendor's `@sparklinkplayjoy/protocol-keyboard` source builds it.
- **Read back after every write** and show what the keyboard actually stored. The firmware usually doesn't report errors; it just keeps the old value. See the polling-rate refusal in PROTOCOL.md.
- **The Fn key's matrix code is `0x01`, but its base-layer default value is `0xF001` (Fn1).** Writing `0x01` makes Fn dead. Use `layerDefault()`.
- On Fn layers 1–3, value **`1` = transparent** (same as base) and `0` = disabled.
- Keys are always identified by their **default code from DEFKEY**, not by their current mapping.
- Per-key mode byte = `(touchMode << 4) | advancedKeyMode`: always keep the existing low nibble.
- Polling-rate values depend on the switch type (`info.keyType`). Use `rateList()`.
- Destructive actions (factory reset) need an explicit confirmation dialog.

## Code style

- Plain modern JavaScript (ES2022), 2-space indent, semicolons, single quotes.
- Small render functions per page (`renderKeymap`, `renderPerf`, …). State lives in `js/state.js` and the page's own file.
- Use `$()` for `getElementById`. Use `textContent` for anything that came from the device; only use `innerHTML` with static strings or values you escaped.
- Styling: use the CSS variables in `css/styles.css` (`--background`, `--foreground`, `--muted`, `--border`, `--primary`, `--info`, …). They have light and dark values. Reuse `.card`, `.btn`, `.seg`, `.switch`, `.badge`, `.field` instead of new one-off styles.
- UI text: plain, short, sentence case. Say what happened ("Fn + C now sends A."), not that "the operation completed".

## Releasing

GitHub Pages lets browsers cache files for about 10 minutes, so a visitor can get the new `index.html` with an old `styles.css` or script.
When a change touches `css/` or `js/`, **bump the `?v=` number on every asset link in `index.html`** (they all share one number):

```
sed -i 's/?v=2"/?v=3"/g' index.html
```

Inline SVG icons also carry `width`/`height` attributes, so they stay small even if the stylesheet arrives late. Keep that for new icons.

## Docs to keep in sync

- `docs/PROTOCOL.md`: any new command, layer, value meaning or hardware finding (date confirmed findings).
- `README.md`: features table and project structure.
