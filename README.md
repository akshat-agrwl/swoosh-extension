<h1 align="left"><img src="extension/favicon/favicon.svg" width="32" valign="middle" /> Swoosh</h1>

**Your tabs, organized.**

Swoosh replaces your Chrome new tab page with a tab dashboard that groups open tabs by site, surfaces stale ones, and helps you clear the clutter — with a satisfying swoosh.

## Features

- **Tab grouping** — Open tabs grouped by domain on a clean grid
- **Tab search** — Press `/` or `Cmd+K` to instantly jump to any open tab
- **Landing pages** — Gmail, YouTube, X, LinkedIn grouped together
- **Duplicate cleanup** — One-click to close duplicate tabs
- **Stale tabs** — Tabs you haven't touched in a while, configurable from 1 hour to 2 weeks
- **Save for later** — Bookmark tabs to a checklist, reopen when ready
- **Archive** — Search through saved tabs
- **Focus time** — See how many tabs you have open and track your focus
- **Themes** — Light/dark mode with warm and cool color palettes

---

## Install

1. Download [`extension.zip`](extension.zip) from this repo
2. Unzip it somewhere permanent (e.g. `~/swoosh-extension/`)
3. Go to `chrome://extensions` in Chrome
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** and select the unzipped folder
6. Open a new tab — you're done

To update later: download the new `extension.zip`, replace the files in your folder, then click the reload icon on the extension card in `chrome://extensions`.

---

## Tech stack

| What | How |
|------|-----|
| Extension | Chrome Manifest V3 |
| Storage | chrome.storage.local |
| Sound | Web Audio API (synthesized, no files) |
| Animations | CSS transitions + JS confetti particles |

---

## License

MIT
