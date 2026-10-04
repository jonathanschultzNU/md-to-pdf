# md2pdf-kit

A thin wrapper around md-to-pdf for turning Markdown notes (including Obsidian notes) into consistently styled PDFs: briefs, proposals, READMEs, handouts.

## One-time setup

```bash
cd path/to/md-to-pdf
PUPPETEER_SKIP_DOWNLOAD=true npm ci
npm run build
```

`PUPPETEER_SKIP_DOWNLOAD` skips Puppeteer's own Chromium download, because the wrapper prints with the installed Microsoft Edge (or Chrome). Run `npm run build` again after pulling upstream changes.

## Use

```bash
node path/to/md-to-pdf/md2pdf-kit/md2pdf.mjs "path/to/note.md"
```

On Windows, `md2pdf-kit\md2pdf.cmd "path\to\note.md"` does the same.

- The PDF goes next to the note, with the same name. Use `--out file.pdf` or `--out folder/` to put it elsewhere.
- Several notes can be given at once.
- `--page-numbers` adds "page x of y" at the bottom, and `--landscape` turns the pages sideways.
- `--theme <name>` or `--accent <color>` changes the colors (see below).
- `--html` also writes the intermediate HTML, for checking the layout.
- An existing PDF is moved to `.pdf-archive/` next to it, with a timestamp, before the new one is written; Obsidian hides that folder. `--no-archive` overwrites instead.

## Colors

One accent color drives the headings, links, table headers and quote bars. The lighter tints are mixed from it automatically.

| Theme | Accent |
|---|---|
| `maroon` (default) | `#7a1f2b` |
| `navy` | `#1f3a5f` |
| `forest` | `#2e5a3a` |
| `teal` | `#1d6672` |
| `plum` | `#5b2a6e` |
| `slate` | `#3d4a57` |
| `mono` | `#222222`, for plain black-and-white printing |

- Any CSS color works with `--accent`, for example `--accent "#0b5394"`.
- In a note, the same settings go in its front matter: `md2pdf: { theme: navy }` or `md2pdf: { accent: "#0b5394" }`.
- To add a theme, add a line to `THEMES` in `md2pdf.mjs`. To change the default, edit `--accent` at the top of `style.css`.

## What happens to the Markdown

- The YAML front matter (Obsidian properties) is dropped. Per-note options go in an `md2pdf:` key:
  ```yaml
  md2pdf: { title: "Project proposal", page_numbers: true, theme: navy }
  ```
- Obsidian syntax is converted:
  - `[[note|label]]` becomes "label", and `[[note]]` becomes "note";
  - `![[image.png]]` becomes an image next to the note;
  - `%%comments%%` are removed;
  - `==highlight==` becomes highlighted text;
  - a callout (`> [!note] Title`) becomes a quote with a title line.
- Fenced code blocks are left alone.
- A line with only `---` starts a new page.

## Style

`style.css` is the house style: Segoe UI at 10.5 pt, accent-colored headings, compact bordered tables, US Letter with 0.75–0.8 in margins. Every PDF picks up changes made there.

## Notes

- This folder is the only change from upstream (simonhaenisch/md-to-pdf), so merging upstream stays simple.
- Math, mermaid and similar are not set up. md-to-pdf supports adding scripts through its `script` option if they're ever needed.
