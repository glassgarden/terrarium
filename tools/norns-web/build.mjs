// Build a static copy of norns-web for a script, to publish or open anywhere:
//
//   node tools/norns-web/build.mjs [--cdn] [script dir, default .] [out dir, default tools/norns-web/dist]
//
// The out dir gets the page, the runtime, files.json (every .lua file of the
// script), the script's lib/Engine_*.js stand-ins (each with its lib/Engine_*/
// folder of files, if it has one), the icons and gallery pictures named in its norns-web.json, and vendored wasmoon; with
// --cdn the page loads the same pinned wasmoon from jsdelivr instead.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { manifest } from "./manifest.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cdn = args.includes("--cdn");
const [dirArg, outArg] = args.filter(a => a !== "--cdn");
const scriptDir = path.resolve(dirArg || ".");
const out = path.resolve(outArg || path.join(here, "dist"));
const WASMOON_CDN = "https://cdn.jsdelivr.net/npm/wasmoon@1.16.0/dist/";

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "script/lib"), { recursive: true });
fs.mkdirSync(path.join(out, "lib"));
for (const f of ["norns-web.js", "lib/norns.lua"]) fs.copyFileSync(path.join(here, f), path.join(out, f));
let page = fs.readFileSync(path.join(here, "index.html"), "utf8");
if (cdn) {
  page = page.replace('window.NORNS_WEB_WASMOON = "vendor/wasmoon/"', `window.NORNS_WEB_WASMOON = "${WASMOON_CDN}"`)
    .replace('<script src="vendor/wasmoon/index.js"></script>', `<script src="${WASMOON_CDN}index.js"></script>`);
} else {
  fs.mkdirSync(path.join(out, "vendor/wasmoon"), { recursive: true });
  for (const f of fs.readdirSync(path.join(here, "vendor/wasmoon"))) {
    fs.copyFileSync(path.join(here, "vendor/wasmoon", f), path.join(out, "vendor/wasmoon", f));
  }
}
const libDir = path.join(scriptDir, "lib");
for (const f of fs.existsSync(libDir) ? fs.readdirSync(libDir) : []) {
  if (/^Engine_.*\.js$/.test(f)) fs.copyFileSync(path.join(libDir, f), path.join(out, "script/lib", f));
  const files = path.join(libDir, f.replace(/\.js$/, ""));   // the stand-in's own files (wasm, workers...)
  if (/^Engine_.*\.js$/.test(f) && fs.existsSync(files) && fs.statSync(files).isDirectory())
    fs.cpSync(files, path.join(out, "script/lib", path.basename(files)), { recursive: true });
}
const m = manifest(scriptDir, "script/", [out]);
// the script's colors, in the page itself so it doesn't flash norns-web's first (as norns-web.js's themeCss)
if (m.about?.theme) {
  const t = m.about.theme;
  const decl = (o) => Object.entries(o || {})
    .filter(([k, v]) => /^[a-z][a-z0-9-]*$/.test(k) && !/[;{}<>]/.test(String(v)))
    .map(([k, v]) => `--${k}: ${v};`).join(" ");
  let css = `:root:root:root { ${decl(t.colors)} }`;
  if (t.dark) css += ` @media (prefers-color-scheme: dark) { :root:root:not([data-theme="light"]) { ${decl(t.dark)} } }` +
    ` :root:root[data-theme="dark"] { ${decl(t.dark)} }`;
  page = page.replace("</head>", `<style id="nw-theme">${css}</style>\n</head>`);
}
// the script's Google Analytics tag (norns-web.json "analytics": a measurement id), only in a build:
// not on the dev server, nor in a plugin's face
const ga = m.about?.analytics;
if (ga && /^G-[A-Z0-9]+$/.test(ga)) {
  page = page.replace("<head>", `<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${ga}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', '${ga}');
  </script>
`);
} else if (ga) console.warn(`norns-web: analytics "${ga}" isn't a Google Analytics measurement id (G-...), left out`);
fs.writeFileSync(path.join(out, "index.html"), page);
for (const f of [m.about?.icon, m.about?.touch_icon, ...(m.about?.gallery || []).map(g => g.img)].filter(Boolean)) {   // the page's icons and pictures (norns-web.json)
  fs.mkdirSync(path.dirname(path.join(out, "script", f)), { recursive: true });
  fs.copyFileSync(path.join(scriptDir, f), path.join(out, "script", f));
}
fs.writeFileSync(path.join(out, "files.json"), JSON.stringify(m));
console.log(`norns-web: ${m.name} (${Object.keys(m.files).length} .lua files) -> ${path.relative(process.cwd(), out) || "."}`);
