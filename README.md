# Notes

A fast, private notebook that runs entirely in your browser. No account, no
server, no tracking, no build step — your notes never leave your device.

**[Open the live app →](https://hv2henry.github.io/Qwen-Test-Hub/)**
*(available once GitHub Pages is enabled — see [Hosting](#hosting))*

You can also just open [`index.html`](index.html) directly from disk. Everything
works; only "install as an app" and offline caching need it to be served over
HTTPS.

---

## Features

- **Instant capture** — type and hit <kbd>Ctrl</kbd>+<kbd>Enter</kbd>. Notes save themselves.
- **Automatic tags** — write `#anything` in a note and it becomes a clickable filter chip, complete with counts.
- **Search** with live highlighting across every note.
- **Pin** important notes to the top.
- **Filters** — All / Pinned / Tagged, combinable with search and tags.
- **Long notes collapse** after 10 lines with a *Show more*, so the list stays scannable (turn it off in Settings).
- **Light / dark / auto** theme, following your system by default.
- **Backup and restore** to a small JSON file, plus a **Markdown export** for reading elsewhere.
- **Installable** — as a PWA it installs to your desktop or home screen and works offline.
- **Keyboard driven** — <kbd>N</kbd> new note, <kbd>/</kbd> search, <kbd>Esc</kbd> clear, <kbd>Ctrl</kbd>+<kbd>Enter</kbd> save. Shortcuts never fire while you're typing.
- **Safe by construction** — note text is always escaped, so pasting HTML or `<script>` can't execute anything.

No dependencies. No framework. One HTML file, one stylesheet, one script.

## Where your notes live

Notes are stored in your browser's `localStorage` under the key
`qwen-test-hub.notes.v1`. That's what makes the app instant and private, and it
has three consequences worth knowing:

1. They're tied to **this browser on this device**. Chrome and Edge are separate
   notebooks; so is your phone.
2. **Clearing browser data erases them.** Use *Backup* in the footer now and
   then — it downloads a `.json` file that *Restore* reads back on any device.
3. Opening `index.html` from a different folder can read as a different
   notebook, because browsers partition storage by origin.

Nothing is uploaded anywhere. There is no network call in this app at all.

## Hosting

The app is static, so any host works.

**GitHub Pages (free, one toggle):**

1. Repository **Settings → Pages**
2. *Build and deployment* → Source: **Deploy from a branch**
3. Branch: **`main`**, folder: **`/ (root)`** → **Save**
4. Your app is live at `https://<user>.github.io/<repo>/` within a minute

Because `index.html` sits at the repository root, `/ (root)` is the right
choice — no `docs/` folder, no build.

Anywhere else — Netlify, Cloudflare Pages, an S3 bucket, or
`python3 -m http.server` — just serve this directory.

## The CLI, too

[`notes.py`](notes.py) is a companion command-line notebook for people who live
in a terminal. It stores notes as plain `.md` files in a `notes/` folder, so
they're diffable, greppable and versionable in git.

```bash
python3 notes.py add "Pay the electricity bill" -t bills
python3 notes.py add -                # body from stdin
python3 notes.py list [--tag bills]   # aliases: ls
python3 notes.py search electricity   # aliases: grep
python3 notes.py show 2               # aliases: cat
python3 notes.py rm 2 [-y]            # aliases: delete
```

The web app and the CLI keep separate stores — the app uses browser storage,
the CLI uses files. They're two front ends for two different habits, not a
synced pair.

## Project layout

```
index.html            the app (markup, styles and logic in one file)
manifest.webmanifest  PWA metadata: name, icons, standalone display
icon.svg              app icon and favicon, scalable, no binaries
sw.js                 service worker: caches the shell so it opens offline
notes.py              the companion CLI notebook
LICENSE               MIT
```

## Development

There is nothing to build. Edit `index.html` and reload.

The app was validated against **74 automated tests** run in a simulated DOM
(jsdom) covering capture, tagging, search, pinning, filtering, editing,
deletion, long-note collapsing, theming, keyboard shortcuts, JSON and Markdown
export, restore, malformed backups, cross-version data, HTML/script injection,
and the no-`createObjectURL` download fallback. If you change the storage
schema, keep the `isNote()` guard and the legacy-note path working — notes
written by older versions must still load.

## License

MIT — see [LICENSE](LICENSE).
