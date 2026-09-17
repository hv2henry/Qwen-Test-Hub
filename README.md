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

## Security

Two different threats matter here, and they have very different answers.

### 1. Malicious note content (closed)

Everything a note contains is escaped before it reaches the DOM, so pasting
`<script>`, `<img onerror=...>`, or an attribute-breakout like `"><svg onload=...>`
renders as literal text and cannot execute. This is covered by automated tests
rather than by assumption, including the search-highlighting path, which is the
one place it is easy to forget.

There are no `eval`, `new Function`, or `javascript:` URLs, and note text never
becomes an attribute value without escaping.

### 2. A tampered-with host (mitigated, not solvable client-side)

If someone controls the server - or gets a commit merged to a repo that GitHub
Pages serves - they can serve different bytes, and no browser-side mechanism
can fully stop that. What the app does is refuse to make that easy:

```
Content-Security-Policy:
  default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self';
  manifest-src 'self'; connect-src 'self' blob:; form-action 'none'; base-uri 'none'
```

- **No `unsafe-inline`, no `unsafe-eval`, no wildcards, no remote origins.** An
  injected `<script>` in the markup is blocked outright, because script can only
  come from a same-origin file.
- **Zero third-party subresources.** No CDN, no analytics, no web font, nothing
  to be compromised upstream and no need for Subresource Integrity hashes.
- **No inline handlers and no inline `style=` attributes**, which is why the
  policy above can be this tight.
- `base-uri 'none'` blocks `<base>` injection; `form-action 'none'` blocks
  exfiltration through a form; `referrer: no-referrer` keeps note content out of
  Referer headers.

The honest limit: an attacker who controls the host can edit `app.js` itself,
and `script-src 'self'` will happily load it. Client-side defences raise the
cost; they do not replace controlling who can deploy. On a public repo, protect
`main` with branch protection and review every PR - a GitHub Pages site built
from `main` runs whatever lands there.

### On your own domain

Two things matter more than any header.

**Serve it from an isolated origin.** Put it on `notes.example.com`, not
`example.com`. Static hosting is a classic XSS amplifier: if the app shares an
origin with anything that sets cookies, a single injection can read them. A
separate subdomain means there is nothing there to steal. (GitHub Pages does
this for you - custom domains are served from `*.githubusercontent.com`, a
different origin from `github.io`, precisely so one site cannot reach another's
cookies.)

**Send real headers.** A `<meta>` CSP cannot express `frame-ancestors` or
`report-uri`, so on your own domain send them from the server and add
`require-trusted-types-for 'script'`:

```nginx
# nginx
add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; manifest-src 'self'; connect-src 'self' blob:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()" always;
```

```
# Netlify / Cloudflare Pages: a _headers file
/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; manifest-src 'self'; connect-src 'self' blob:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()
```

Add `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` if you want full origin isolation.

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
index.html            markup only - no inline script, style or handlers
styles.css            all styling, including both themes
app.js                all behaviour
manifest.webmanifest  PWA metadata: name, icons, standalone display
icon.svg              app icon and favicon, scalable, no binaries
sw.js                 service worker: caches the shell so it opens offline
notes.py              the companion CLI notebook
LICENSE               MIT
```

Markup, style and behaviour are deliberately kept in separate files. That is
what makes the strict Content Security Policy below possible - a page with an
inline `<script>` can never have one without punching a hole in it.

## Development

There is nothing to build. Edit `index.html` and reload.

The app is validated against **106 automated tests** run in a simulated DOM
(jsdom). They cover capture, tagging, search, pinning, filtering, editing,
deletion, long-note collapsing, theming, keyboard shortcuts, JSON and Markdown
export, restore, malformed and legacy storage, the no-`createObjectURL`
download fallback, and the security properties above - CSP directives, absence
of inline script/style/handlers, absence of third-party subresources, and six
distinct injection attempts. If you change the storage
schema, keep the `isNote()` guard and the legacy-note path working — notes
written by older versions must still load.

## License

MIT — see [LICENSE](LICENSE).
