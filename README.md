<h1 align="left"><img src="extension/favicon/favicon.svg" width="32" valign="middle" /> Swoosh</h1>

**Your tabs, organized.**

Swoosh replaces your Chrome new tab page with a tab dashboard that groups open tabs by site, surfaces stale ones, and helps you clear the clutter — with a satisfying swoosh.

## Features

- **Tab grouping** — Open tabs grouped by domain on a clean grid
- **Smart AI grouping** — Cluster tabs by intent/topic using Groq
- **Pinned tabs strip** — Icon-only pinned tabs for one-click access
- **Tab search** — Press `/` or `Cmd+K` to instantly jump to any open tab
- **Daily Dev Digest** — Curated feed of AI/dev articles from 10 RSS sources, refreshed daily at 8 AM
- **Landing pages** — Gmail, YouTube, X, LinkedIn grouped together
- **Duplicate cleanup** — One-click to close duplicate tabs
- **Stale tabs** — Tabs you haven't touched in a while, configurable from 1 hour to 2 weeks
- **Save for later** — Bookmark tabs to a checklist, reopen when ready
- **Archive** — Search through saved tabs
- **Themes** — Light/dark mode with warm and cool color palettes

## Install

1. Download [`extension.zip`](extension.zip) from the [latest release](https://github.com/akshat-agrwl/swoosh-extension/releases/latest)
2. Unzip it somewhere permanent (e.g. `~/swoosh-extension/`)
3. Go to `chrome://extensions` in Chrome
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** and select the unzipped folder
6. Open a new tab — you're done

To update: download the new `extension.zip` from the latest release, replace your folder files, and reload the extension in `chrome://extensions`.

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
