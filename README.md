# Qwen-Test-Hub
Trying to collaborate with the new Qwen agent.

## notes.py

A tiny markdown notebook that lives in this repo. Notes are plain `.md` files
under `notes/`, so they diff, merge and render on GitHub like anything else.
Standard library only, Python 3.8+, no install step.

```
python3 notes.py add "Rough idea" -t "shopping, later"
python3 notes.py add -                  # body from stdin
python3 notes.py list                   # or: ls
python3 notes.py list --tag later
python3 notes.py search idea            # or: grep
python3 notes.py show 2                 # or: cat
python3 notes.py rm 2                   # or: delete  (-y to skip confirming)
```

Notes can be addressed by the ID shown in `list`, or by any unique fragment of
the filename.

### Note format

```markdown
# Title

Created: 2026-09-17 17:21:34 +0000
Tags: shopping, errands, coffee

---

Body text goes here.
```

The title defaults to the first line of the body; pass `--title` to override.
`#hashtags` in the body are picked up as tags automatically and stripped from
an auto-derived title.

### Design notes

- **Files, not a database.** Every note is one `.md` file named
  `YYYYMMDD-HHMMSS-slug.md`, which keeps ordering stable and makes concurrent
  edits from two people merge cleanly instead of colliding.
- **IDs are positional.** `list` numbers notes by creation order starting at 1.
  IDs shift when a note is deleted, so prefer filename fragments in scripts.
- Errors exit non-zero with a message on stderr, so it composes in shell
  one-liners.
