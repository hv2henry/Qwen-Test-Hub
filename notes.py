#!/usr/bin/env python3
"""notes.py - a tiny markdown notebook that lives in this repo.

Notes are plain .md files under notes/, so they diff, merge and render on
GitHub like anything else. Stdlib only; Python 3.8+.

    python3 notes.py add "Rough idea" -t "shopping, later"
    python3 notes.py add -              # read the body from stdin
    python3 notes.py list
    python3 notes.py search idea
    python3 notes.py show 2
    python3 notes.py rm 2
"""

import argparse
import datetime
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
NOTES_DIR = os.path.join(ROOT, "notes")
WIDTH = 72

TAG_RE = re.compile(r"#([A-Za-z0-9][\w-]*)")
SLUG_BAD = re.compile(r"[^a-z0-9]+")


def now():
    return datetime.datetime.now().astimezone()


def slugify(text, maxlen=24):
    s = SLUG_BAD.sub("-", text.strip().lower()).strip("-")
    return (s[:maxlen].rstrip("-")) or "note"


def ensure_dir():
    os.makedirs(NOTES_DIR, exist_ok=True)
    return NOTES_DIR


def load():
    """Return notes sorted oldest-first. Index 1 == 'id 1' in the CLI."""
    if not os.path.isdir(NOTES_DIR):
        return []
    out = []
    for name in os.listdir(NOTES_DIR):
        if not name.endswith(".md"):
            continue
        path = os.path.join(NOTES_DIR, name)
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        meta = {"path": path, "file": name, "raw": text}
        m = re.match(r"^# (.*)$", text, re.M)
        meta["title"] = m.group(1).strip() if m else name[:-3]
        m = re.search(r"^Created:\s*(.+)$", text, re.M)
        meta["created"] = m.group(1).strip() if m else ""
        m = re.search(r"^Tags:\s*(.+)$", text, re.M)
        meta["tags"] = [t.strip() for t in m.group(1).split(",") if t.strip()] if m else []
        # body = everything after the metadata block
        sep = "\n---\n"
        idx = text.find(sep)
        meta["body"] = text[idx + len(sep):].strip() if idx != -1 else text.strip()
        meta["auto_tags"] = sorted(set(t.lower() for t in TAG_RE.findall(text)))
        out.append(meta)
    out.sort(key=lambda n: (n["created"], n["file"]))
    for i, n in enumerate(out, 1):
        n["id"] = i
    return out


def resolve(notes, ident):
    """Accept an id number or a filename fragment."""
    if ident.isdigit():
        i = int(ident)
        if 1 <= i <= len(notes):
            return notes[i - 1]
        sys.exit("error: no note with id %s (try `notes.py list`)" % ident)
    hits = [n for n in notes if ident.lower() in n["file"].lower()]
    if len(hits) == 1:
        return hits[0]
    if not hits:
        sys.exit("error: no note matching %r" % ident)
    sys.exit("error: %r is ambiguous: %s" % (ident, ", ".join(h["file"] for h in hits)))


def cmd_add(args):
    body = sys.stdin.read() if args.body == "-" else args.body
    body = body.strip()
    if not body:
        sys.exit("error: empty note")
    ensure_dir()

    title = args.title_note or body.splitlines()[0].strip()
    title = title.lstrip("#").strip()
    if not args.title_note:
        title = re.sub(r"\s+", " ", TAG_RE.sub("", title)).strip()
    title = title or "Untitled"

    tags = [t.strip().lower() for t in (args.tags or "").split(",") if t.strip()]
    tags += [t for t in TAG_RE.findall(body) if t.lower() not in tags]
    tags = list(dict.fromkeys(t.lower() for t in tags))

    ts = now()
    stamp = ts.strftime("%Y%m%d-%H%M%S")
    fname = "%s-%s.md" % (stamp, slugify(title))
    path = os.path.join(NOTES_DIR, fname)
    n = 2
    while os.path.exists(path):
        path = os.path.join(NOTES_DIR, "%s-%s-%d.md" % (stamp, slugify(title), n))
        n += 1

    created = ts.strftime("%Y-%m-%d %H:%M:%S %z").strip()
    content = "# %s\n\nCreated: %s\n" % (title, created)
    if tags:
        content += "Tags: %s\n" % ", ".join(tags)
    content += "\n---\n\n%s\n" % body
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)

    print("saved notes/%s" % os.path.basename(path))
    if tags:
        print("tags: %s" % ", ".join(tags))


def cmd_list(args):
    notes = load()
    if args.tag:
        want = args.tag.lower().lstrip("#")
        notes = [n for n in notes
                 if want in n["tags"] or want in n["auto_tags"]]
    if not notes:
        print("no notes yet - try: python3 notes.py add \"first thought\"")
        return
    print("%-4s %-17s %s" % ("ID", "CREATED", "TITLE"))
    print("-" * WIDTH)
    for n in notes:
        when = n["created"][:16] or "?"
        head = "%-4d %-17s " % (n["id"], when)
        room = WIDTH - len(head)
        tagstr = (" [%s]" % ",".join(n["tags"])) if n["tags"] else ""
        title = n["title"]
        if len(title) + len(tagstr) > room:
            keep = max(8, room - len(tagstr) - 1)
            if keep < len(title):
                title = title[:keep].rstrip() + "\u2026"
            else:
                tagstr = ""
        print(head + title + tagstr)
    print("-" * WIDTH)
    print("%d note(s) in notes/" % len(notes))


def cmd_search(args):
    notes = load()
    needle = args.query.lower()
    hits = []
    for n in notes:
        hay = (n["title"] + "\n" + n["body"] + "\n" + " ".join(n["tags"])).lower()
        if needle in hay:
            lines = n["body"].splitlines()
            snippet = next((l.strip() for l in lines if needle in l.lower()), "")
            if not snippet and lines:
                snippet = lines[0].strip()
            hits.append((n, snippet))
    if not hits:
        print("no notes matching %r" % args.query)
        return
    for n, snippet in hits:
        print("%-4d %s" % (n["id"], n["title"]))
        print("     %s" % (snippet[: WIDTH - 5]))
        print("     notes/%s" % n["file"])
    print("\n%d match(es)" % len(hits))


def cmd_show(args):
    notes = load()
    n = resolve(notes, args.ident)
    print(n["raw"].rstrip())
    print()
    print("[notes/%s]" % n["file"])


def cmd_rm(args):
    notes = load()
    n = resolve(notes, args.ident)
    if not args.yes:
        ans = input("delete %r (notes/%s)? [y/N] " % (n["title"], n["file"])).strip().lower()
        if ans not in ("y", "yes"):
            print("cancelled")
            return
    os.remove(n["path"])
    print("deleted notes/%s" % n["file"])


def main(argv=None):
    p = argparse.ArgumentParser(
        prog="notes.py",
        description="A tiny markdown notebook that lives in this repo.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='examples:\n'
               '  notes.py add "Rough idea" -t "shopping, later"\n'
               '  notes.py list --tag later\n'
               '  notes.py search idea\n')
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("add", help="add a note")
    a.add_argument("body", help='note text, or "-" to read from stdin')
    a.add_argument("-t", "--tags", help="comma-separated tags")
    a.add_argument("--title", dest="title_note", help="override the title")
    a.set_defaults(fn=cmd_add)

    l = sub.add_parser("list", aliases=["ls"], help="list notes")
    l.add_argument("--tag", help="only notes with this tag")
    l.set_defaults(fn=cmd_list)

    s = sub.add_parser("search", aliases=["grep"], help="full-text search")
    s.add_argument("query")
    s.set_defaults(fn=cmd_search)

    sh = sub.add_parser("show", aliases=["cat"], help="print one note")
    sh.add_argument("ident", help="id number or filename fragment")
    sh.set_defaults(fn=cmd_show)

    r = sub.add_parser("rm", aliases=["delete"], help="delete a note")
    r.add_argument("ident", help="id number or filename fragment")
    r.add_argument("-y", "--yes", action="store_true", help="skip confirmation")
    r.set_defaults(fn=cmd_rm)

    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
