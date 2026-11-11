// The PDF manual, made from doc/MANUAL.md: markdown -> a print-styled page -> headless
// Chromium -> doc/terrarium-manual.pdf. A cover from the title and hero picture, each
// module of the field guide as a card (picture beside its text), each chapter on a new
// page, working contents links, page numbers.
//
//   make manual-pdf     (npm install in tools/manual first; needs a Chromium, see below)
//
// Chromium: CHROMIUM=/path/to/chrome, or the newest Playwright one in ~/.cache/ms-playwright.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { marked } from "marked";
import { chromium } from "playwright-core";
import { PDFDocument } from "pdf-lib";

const here = path.dirname(fileURLToPath(import.meta.url));
const docDir = path.resolve(here, "../../doc");
// node pdf.mjs [source in doc/, default MANUAL.md] [pdf in doc/, default terrarium-manual.pdf]
const [srcName = "MANUAL.md", outName = "terrarium-manual.pdf"] =
  process.argv.slice(2);
const out = path.join(docDir, outName);

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = path.join(os.homedir(), ".cache/ms-playwright");
  const builds = fs.existsSync(cache)
    ? fs
        .readdirSync(cache)
        .filter((d) => /^chromium-\d+$/.test(d))
        .sort()
    : [];
  for (const b of builds.reverse()) {
    const exe = path.join(cache, b, "chrome-linux/chrome");
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error(
    "no Chromium found: set CHROMIUM=/path/to/chrome (or: npx playwright install chromium)",
  );
}

// the page's colors (norns-web.json's theme) for the print: ink, muted, rules, accent; white paper
const theme = (() => {
  try {
    return (
      JSON.parse(
        fs.readFileSync(path.resolve(here, "../../norns-web.json"), "utf8"),
      ).theme?.colors || {}
    );
  } catch {
    return {};
  }
})();
const themeVars = Object.entries({
  ink: theme.ink,
  muted: theme.muted,
  rule: theme.rule,
  wash: theme.surface,
  accent: theme.accent,
  cover: theme.surface,
})
  .filter(([, v]) => v)
  .map(([k, v]) => `--${k}: ${v};`)
  .join(" ");
// the foreword's photograph, toned to the book: its darks to the ink, its middle to the accent
// (lightened), its lights to the cover's paper (an SVG filter, as Achene's manual has it)
const hex = (h, f) =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const toneOf = (k, d) => hex(theme[k] || d);
const lerp3 = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
const tones = [
  toneOf("ink", "#1b1f1c"),
  lerp3(toneOf("accent", "#8a5f12"), toneOf("surface", "#f4f5f1"), 0.35),
  toneOf("surface", "#f4f5f1"),
];
const table = (c) => tones.map((t) => t[c].toFixed(3)).join(" ");
const PLATE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="plate" color-interpolation-filters="sRGB">
  <feColorMatrix type="saturate" values="0" result="grey"/>
  <feComponentTransfer in="grey" result="tone">
    <feFuncR type="table" tableValues="${table(0)}"/><feFuncG type="table" tableValues="${table(1)}"/><feFuncB type="table" tableValues="${table(2)}"/>
  </feComponentTransfer>
  <feComposite in="tone" in2="SourceGraphic" operator="arithmetic" k1="0" k2="0.75" k3="0.25" k4="0"/>
</filter></svg>`;
const sceneArt =
  fs.existsSync(path.join(docDir, "img/manual-cover.png")) &&
  fs.existsSync(path.join(docDir, "img/manual-ground.png"));

const CSS = `
@page { size: A4; margin: 16mm 17mm 18mm; }
:root { --ink: #1b1f1c; --muted: #5a625c; --rule: #d3d7d0; --wash: #f1f2ee; --accent: #8a5f12; }
:root { ${themeVars} }
* { box-sizing: border-box; }
body { font: 10.5pt/1.5 "Atkinson Hyperlegible", "Helvetica Neue", Arial, sans-serif; color: var(--ink); margin: 0; }
h1, h2, h3 { font-family: "Silkscreen", "JetBrains Mono", monospace; font-weight: 400; letter-spacing: 0.04em; line-height: 1.2; }
h2 { font-size: 19pt; margin: 0 0 6mm; padding-bottom: 2mm; border-bottom: 1.5px solid var(--ink); break-before: page; break-after: avoid; }
/* under a chapter's title, a strip of the jar's ground (doc/img/manual-ground.png) for its rule */
h2.ground { border-bottom: 0; padding-bottom: 6mm; background: url(img/manual-ground.png) left bottom / auto 3.2mm no-repeat; image-rendering: pixelated; }
h2#contents { break-before: auto; }
h3 { font-size: 13pt; margin: 7mm 0 2mm; color: var(--accent); break-after: avoid; }
h4 { font: 700 11pt/1.3 "JetBrains Mono", monospace; margin: 0 0 1.5mm; break-after: avoid; }
p { margin: 0 0 3mm; orphans: 3; widows: 3; }
ul { margin: 0 0 3mm; padding-left: 5mm; }
li { margin-bottom: 1mm; }
a { color: inherit; text-decoration: none; }
hr { display: none; }
code { font: 8.8pt "JetBrains Mono", monospace; background: var(--wash); padding: 0.3mm 1mm; border-radius: 1mm; }
pre { background: var(--wash); padding: 3mm 4mm; border-radius: 2mm; break-inside: avoid; overflow: hidden; }
pre code { background: none; padding: 0; font-size: 8.5pt; line-height: 1.45; }
img { image-rendering: pixelated; max-width: 100%; display: block; border-radius: 2mm; }
p > img:only-child { margin: 1mm auto 3mm; max-width: 60%; }
table { border-collapse: collapse; width: 100%; margin: 1mm 0 4mm; font-size: 9.3pt; break-inside: avoid; }
th, td { border-bottom: 1px solid var(--rule); padding: 1.4mm 2mm; text-align: left; vertical-align: top; }
th { font: 700 8.5pt "JetBrains Mono", monospace; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
td img { max-width: 100%; }

/* the cover: edge to edge on the lightest of the theme's tints, the jar's scene along its foot
   (doc/img/manual-cover.png); it's printed again on its own, without the footer, and swapped in */
@page :first { margin: 0; }
.cover.scene { height: 297mm; padding: 0 17mm 60mm; position: relative; overflow: hidden; background: var(--cover, #fff); }
.cover.scene .band { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; max-width: none; border-radius: 0; margin: 0; }
.cover.scene .made { margin-top: 10mm; }
.cover { height: 255mm; display: flex; flex-direction: column; justify-content: center; text-align: center; break-after: page; }
.cover h1 { font-size: 44pt; margin: 0 0 3mm; }
.cover .subtitle { font-size: 13pt; color: var(--muted); margin: 0 0 14mm; }
.cover img { max-width: 100%; margin: 0 auto; }
.cover .made { margin-top: 14mm; font: 8.5pt "JetBrains Mono", monospace; color: var(--muted); letter-spacing: 0.08em; }

/* the foreword: a letter on a page of its own, indented, in a serif (after Achene's manual): the
   jar's mark over it, a drop cap, and the sign-off beside the photograph, toned to the book */
.foreword { break-before: page; break-after: page; padding: 10mm 6mm 0 28mm; }
.foreword .mark { width: 11mm; height: auto; margin: 0 0 4mm; border-radius: 0; image-rendering: pixelated; }
.foreword h2 { break-before: auto; font: italic 300 23pt/1.2 "Fraunces", Georgia, serif; letter-spacing: 0; color: var(--accent);
  border: 0; background: none; margin: 0 0 6mm; padding: 0; }
.foreword p { font: 300 10.5pt/1.65 "Fraunces", Georgia, serif; margin: 0 0 3.2mm; }
.foreword h2 + p::first-letter { float: left; font: 400 34pt/0.9 "Fraunces", Georgia, serif; color: var(--accent); padding: 1.2mm 2mm 0 0; }
.foreword .signoff { display: grid; grid-template-columns: 1fr 46mm; gap: 8mm; align-items: end; margin-top: 10mm; }
.foreword .signoff p { margin: 0; font-style: italic; }
.foreword .signoff img { width: 46mm; max-width: none; margin: 0; border-radius: 1.5mm; filter: url(#plate); }

/* contents */
h2#contents + ul { list-style: none; padding: 0; columns: 2; font: 10pt "JetBrains Mono", monospace; }
h2#contents + ul li { margin-bottom: 2mm; }

/* the field guide: a card per module, picture beside its text */
.module { display: grid; grid-template-columns: 47% 1fr; gap: 6mm; align-items: start; margin: 0 0 6mm; break-inside: avoid; }
.module .pic img { max-width: 100%; margin: 0; }
.module .pic p { margin: 0 0 2mm; }
.module ul { padding-left: 4mm; }
.module + .more { margin: -2mm 0 6mm; }
.more p > img:only-child { max-width: 58%; }
`;

const md = fs.readFileSync(path.join(docDir, srcName), "utf8");
const page_html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><base href="${pathToFileURL(docDir + "/").href}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@400;700&family=Silkscreen&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300&display=swap">
<style>${CSS}</style></head><body>${PLATE}${marked.parse(md)}</body></html>`;

const tmp = path.join(here, ".print.html");
fs.writeFileSync(tmp, page_html);
const browser = await chromium.launch({ executablePath: findChromium() });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle" });
  await page.evaluate((sceneArt) => {
    // GitHub-style ids, so the contents links work in the PDF
    for (const h of document.querySelectorAll("h1, h2, h3, h4")) {
      h.id = h.textContent
        .trim()
        .toLowerCase()
        .replace(/[^\w\- ]+/g, "")
        .replace(/ /g, "-");
    }
    // the cover: the title, its subtitle and the hero picture
    const h1 = document.querySelector("h1"),
      sub = h1.nextElementSibling,
      hero = sub.nextElementSibling;
    const cover = document.createElement("section");
    cover.className = "cover";
    h1.before(cover);
    sub.className = "subtitle";
    cover.append(h1, sub, hero);
    // the foreword: "## Foreword" up to its sign-off (the paragraph after its last picture) is a
    // letter on its own page; what follows the sign-off (the opening) stays where it is
    const fw = [...document.querySelectorAll("h2")].find((h) =>
      /^foreword$/i.test(h.textContent.trim()),
    );
    if (fw) {
      const section = document.createElement("section");
      section.className = "foreword";
      fw.before(section);
      const mark = document.createElement("img");
      mark.className = "mark";
      mark.src = "img/icon.svg";
      mark.alt = "";
      section.append(mark, fw);
      const letter = [];
      for (
        let e = section.nextElementSibling;
        e && e.tagName !== "H2";
        e = e.nextElementSibling
      )
        letter.push(e);
      const isPic = (n) =>
        n.tagName === "P" &&
        n.children.length === 1 &&
        n.firstElementChild.tagName === "IMG" &&
        n.textContent.trim() === "";
      const last = letter.map(isPic).lastIndexOf(true);
      const end =
        last >= 0 && letter[last + 1]?.tagName === "P"
          ? last + 1
          : letter.length - 1;
      section.append(...letter.slice(0, end + 1));
      if (last >= 0 && end === last + 1) {
        const signoff = document.createElement("div");
        signoff.className = "signoff";
        const pic = letter[last],
          words = letter[end];
        pic.before(signoff);
        signoff.append(words, pic.firstElementChild);
        pic.remove();
      }
      // after the contents, as a book has it: the contents' list, then the letter's page
      const toc = document.getElementById("contents");
      const list = toc && toc.nextElementSibling;
      if (list && list.tagName === "UL") list.after(section);
    }
    const made = document.createElement("p");
    made.className = "made";
    made.innerHTML =
      "player's manual<br><br>glassgarden<span style='color: #d9a441;'>.</span> · glassgarden.cc<br>© 2026";
    cover.append(made);
    // with the scene's pictures (make manual-scene): the jar along the cover's foot, its ground under each chapter
    if (sceneArt) {
      cover.classList.add("scene");
      const band = document.createElement("img");
      band.className = "band";
      band.src = "img/manual-cover.png";
      band.alt = "";
      cover.append(band);
      for (const h2 of document.querySelectorAll("h2:not(.foreword h2)"))
        h2.classList.add("ground");
    }
    // a card per module: an h4, its first picture beside its text (up to the next heading);
    // any further pictures (the flowers, condensation, frost) go below the card
    const isPicture = (n) =>
      n.tagName === "P" &&
      n.children.length === 1 &&
      n.firstElementChild.tagName === "IMG" &&
      n.textContent.trim() === "";
    for (const h4 of [...document.querySelectorAll("h4")]) {
      const card = document.createElement("div"),
        pic = document.createElement("div"),
        text = document.createElement("div");
      const more = document.createElement("div");
      card.className = "module";
      pic.className = "pic";
      text.className = "text";
      more.className = "more";
      h4.before(card);
      text.append(h4);
      let n = card.nextElementSibling;
      while (
        n &&
        !/^(H2|H3|H4|HR)$/.test(n.tagName) &&
        !n.classList.contains("module")
      ) {
        const next = n.nextElementSibling;
        if (isPicture(n)) (pic.childElementCount ? more : pic).append(n);
        else if (more.childElementCount)
          more.append(n); // text after a later picture stays with it
        else text.append(n);
        n = next;
      }
      card.append(
        pic.childElementCount ? pic : document.createElement("div"),
        text,
      );
      if (more.childElementCount) card.after(more);
    }
  }, sceneArt);
  await page.evaluate(() => document.fonts.ready);
  const body = await page.pdf({
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;font:8px 'JetBrains Mono',monospace;color:#8a8f8a;padding:0 17mm;display:flex;justify-content:space-between">
      <span>terrarium · glassgarden<span style='color: #d9a441;'>.</span></span><span class="pageNumber"></span></div>`,
  });
  // Chromium prints its footer on every page: with the scene, the cover is printed once more, alone
  // and without it, and takes page 1's place (the other pages, their numbers and links unchanged)
  let pdf = body;
  if (sceneArt) {
    await page.addStyleTag({
      content: "body > :not(.cover) { display: none !important; }",
    });
    const cover = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      pageRanges: "1",
    });
    const doc = await PDFDocument.load(body),
      alone = await PDFDocument.load(cover);
    const [first] = await doc.copyPages(alone, [0]);
    doc.removePage(0);
    doc.insertPage(0, first);
    pdf = await doc.save();
  }
  fs.writeFileSync(out, pdf);
  console.log(
    `${path.relative(process.cwd(), out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`,
  );
} finally {
  await browser.close();
  fs.rmSync(tmp, { force: true });
}
