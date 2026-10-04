#!/usr/bin/env node
// md2pdf: turn Markdown notes (plain or Obsidian-flavored) into PDFs with
// md-to-pdf (this fork's dist/), the house stylesheet and the installed Edge.
//
// Usage:
//   node md2pdf-kit/md2pdf.mjs <file.md> [more.md ...] [options]
// Options:
//   --out <path>      output PDF (one input) or folder (several inputs). Default: next to each .md
//   --page-numbers    add "page x of y" at the bottom
//   --landscape       landscape pages
//   --html            also write the intermediate .html (for checking layout)
//   --no-archive      overwrite an existing PDF instead of moving it to .pdf-archive/ first
//   --theme <name>    color theme: maroon (default), navy, forest, teal, plum, slate, mono
//   --accent <color>  any CSS color for headings, links and table headers, e.g. "#1f3a5f"
//
// What it does to the Markdown before rendering:
//   - drops the YAML front matter (Obsidian properties never print). Per-file overrides go in an
//     `md2pdf:` key, e.g. `md2pdf: { landscape: true, page_numbers: true, title: "...", theme: navy, accent: "#1f3a5f" }`;
//   - [[note|label]] → label, [[note]] → note, ![[image.png]] → an image next to the note,
//     %%comments%% removed, ==highlight== → <mark>, callouts "> [!note] Title" → a titled quote;
//   - lists right after a paragraph still render as lists (marked follows CommonMark here).
// An existing PDF is moved to .pdf-archive/ (hidden from Obsidian) before it is replaced.
// Requires: `npm ci` with PUPPETEER_SKIP_DOWNLOAD=true, then `npm run build` in the repo root.

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const { mdToPdf } = require(join(HERE, "..", "dist", "index.js"));
const grayMatter = require("gray-matter");

const EDGE = [
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].find(existsSync);

const argv = process.argv.slice(2);
const flag = (f) => { const i = argv.indexOf(f); if (i === -1) return false; argv.splice(i, 1); return true; };
const opt = (f) => { const i = argv.indexOf(f); if (i === -1) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const OUT = opt("--out");
const PAGE_NUMBERS = flag("--page-numbers");
const LANDSCAPE = flag("--landscape");
const HTML = flag("--html");
const NO_ARCHIVE = flag("--no-archive");
const THEME = opt("--theme");
const ACCENT = opt("--accent");

// Accent colors for --theme. Everything else (table headers, quote bars) is mixed from the accent in style.css.
const THEMES = { maroon: "#7a1f2b", navy: "#1f3a5f", forest: "#2e5a3a", teal: "#1d6672", plum: "#5b2a6e", slate: "#3d4a57", mono: "#222222" };
const accentFor = (theme, accent) => {
	if (accent) return String(accent);
	if (!theme) return null;
	if (!THEMES[theme]) { console.error(`unknown theme "${theme}"; use one of: ${Object.keys(THEMES).join(", ")}`); process.exit(1); }
	return THEMES[theme];
};
const inputs = argv.filter((a) => !a.startsWith("--"));
if (!inputs.length) { console.error("usage: node md2pdf-kit/md2pdf.mjs <file.md> [more.md ...] [--out path] [--page-numbers] [--landscape] [--theme name | --accent color] [--html] [--no-archive]"); process.exit(1); }
if (!EDGE) { console.error("No Edge or Chrome found; set launch_options.executablePath in md2pdf.mjs."); process.exit(1); }

const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`; };
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Obsidian-flavored Markdown → plain Markdown (outside fenced code blocks only).
function obsidianToMarkdown(md) {
	return md.split(/(^```[\s\S]*?^```)/m).map((part, i) => {
		if (i % 2) return part; // fenced code: leave alone
		return part
			.replace(/%%[\s\S]*?%%/g, "")
			.replace(/!\[\[([^\]|]+?)(?:\|(\d+)(?:x\d+)?)?\]\]/g, (_, f, w) => `<img src="${encodeURI(f.trim())}"${w ? ` width="${w}"` : ""}>`)
			.replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$2")
			.replace(/\[\[([^\]|#]+)(?:#([^\]|]*))?\]\]/g, (_, n, h) => basename(n.trim()) + (h ? ` (${h.trim()})` : ""))
			.replace(/==([^=\n]+)==/g, "<mark>$1</mark>")
			.replace(/^(>\s*)\[!(\w+)\][+-]?\s*(.*)$/gm, (_, q, type, title) => `${q}<div class="callout-title">${esc(title || type)}</div>\n${q}`);
	}).join("");
}

for (const input of inputs) {
	const src = resolve(input);
	if (!existsSync(src) || extname(src).toLowerCase() !== ".md") { console.error(`skip (not a .md file): ${input}`); continue; }
	const { content, data } = grayMatter(readFileSync(src, "utf8"));
	const per = (data && typeof data.md2pdf === "object" && data.md2pdf) || {};

	let dest = join(dirname(src), basename(src, extname(src)) + ".pdf");
	if (OUT) dest = inputs.length === 1 && OUT.toLowerCase().endsWith(".pdf") ? resolve(OUT) : join(resolve(OUT), basename(dest));
	mkdirSync(dirname(dest), { recursive: true });

	const landscape = LANDSCAPE || per.landscape === true;
	const pageNumbers = PAGE_NUMBERS || per.page_numbers === true;
	const accent = accentFor(THEME || per.theme, ACCENT || per.accent);
	const config = {
		basedir: dirname(src),
		stylesheet: [join(HERE, "style.css")],
		css: accent ? `:root { --accent: ${accent.replace(/[;{}<>]/g, "")}; }` : "",
		document_title: per.title || basename(src, extname(src)),
		page_media_type: "print",
		marked_options: { gfm: true, breaks: false },
		launch_options: { executablePath: EDGE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] },
		pdf_options: {
			format: "Letter",
			landscape,
			printBackground: true,
			margin: { top: "0.75in", right: "0.8in", bottom: pageNumbers ? "0.85in" : "0.75in", left: "0.8in" },
			displayHeaderFooter: pageNumbers,
			headerTemplate: "<span></span>",
			footerTemplate: pageNumbers
				? '<div style="width:100%;text-align:center;font-family:Segoe UI,Arial;font-size:8pt;color:#777">page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
				: "<span></span>",
		},
	};

	if (existsSync(dest) && !NO_ARCHIVE) {
		const arch = join(dirname(dest), ".pdf-archive");
		mkdirSync(arch, { recursive: true });
		renameSync(dest, join(arch, `${basename(dest, ".pdf")} (${stamp()}).pdf`));
	}
	const md = obsidianToMarkdown(content);
	if (HTML) {
		const html = await mdToPdf({ content: md }, { ...config, as_html: true });
		writeFileSync(dest.replace(/\.pdf$/i, ".html"), html.content);
	}
	const pdf = await mdToPdf({ content: md }, config);
	writeFileSync(dest, pdf.content);
	console.log(`${dest}  (${Math.round(statSync(dest).size / 1024)} KB)`);
}
