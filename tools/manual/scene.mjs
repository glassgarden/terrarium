// The manual's two pictures of the jar's scene, made from the page itself (norns-web, with the
// scene lib/Engine_Terrarium/sky.js draws behind the device): a wide band for the bottom of the
// cover, and a thin strip of the ground (the plants on it, the pond's edge) under each chapter's
// title. The device is hidden; only the scene is shot.
//
//   make manual-scene     (npm install in tools/manual first; needs a Chromium, as pdf.mjs)
//
// doc/img/manual-cover.png, doc/img/manual-ground.png
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const imgDir = path.join(root, "doc/img");

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = path.join(os.homedir(), ".cache/ms-playwright");
  const builds = fs.existsSync(cache) ? fs.readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort() : [];
  for (const b of builds.reverse()) {
    const exe = path.join(cache, b, "chrome-linux/chrome");
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error("no Chromium found: set CHROMIUM=/path/to/chrome (or: npx playwright install chromium)");
}

// the jar on the cover (as the hero picture): rain on a meadow, the pond, clouds, the aurora, at night
const JAR = { brain_kind: 1, voice_kind: 1, color_kind: 1, air_kind: 1, drone_kind: 1, t_day: 1,
  rain_rate: 0.6, meadow_harmonics: 0.5, aurora_glow: 0.9 };

const freePort = () => new Promise((ok) => {
  const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); });
});

const port = await freePort();
const server = spawn("node", [path.join(root, "tools/norns-web/serve.mjs"), root, String(port)], { stdio: "ignore" });
const browser = await chromium.launch({ executablePath: findChromium() });
try {
  await new Promise(r => setTimeout(r, 800));
  // wide, so the band spans an A4 page in whole sky pixels (4 CSS pixels each)
  const page = await browser.newPage({ viewport: { width: 2400, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => document.querySelector("#oled")
    .getContext("2d").getImageData(0, 0, 128, 64).data.some((v, i) => i % 4 === 0 && v > 0), null, { timeout: 30000 });
  const lua = Object.entries(JAR).map(([k, v]) => `params:set("${k}", ${v})`).join(" ");
  await page.evaluate((code) => {
    document.querySelector("#repl").value = code;
    document.querySelector("#repl-form").requestSubmit();
  }, lua);
  // only the scene: everything over it hidden, but kept in its place (the ground is under the device)
  await page.addStyleTag({ content: ".night .wrap, #hood { visibility: hidden !important; }" });
  await page.waitForTimeout(12000); // the rain and the notes get going
  const box = await page.evaluate(() => {
    const n = document.querySelector("#night").getBoundingClientRect(), d = document.querySelector("#device").getBoundingClientRect();
    return { top: n.top, bottom: n.bottom, ground: d.bottom, width: n.width };
  });
  const shot = async (file, y0, y1) => {
    await page.screenshot({ path: path.join(imgDir, file), clip: { x: 0, y: y0, width: box.width, height: y1 - y0 } });
    console.log(`doc/img/${file}`);
  };
  // the band: the horizon's glow down to the ground, the pond and the soil's top (not the whole sky:
  // the cover stays mostly paper)
  await shot("manual-cover.png", Math.max(box.top, box.ground - 260), box.ground + 36);
  // the strip: the plants on the ground and the ground line, from the sky's own pixels, with the
  // sky behind them cleared (each row's commonest color), so it sits on the paper
  const png = await page.evaluate(() => {
    const sky = document.querySelector("#sky"), g = sky.getContext("2d");
    const d = document.querySelector("#device").getBoundingClientRect(), n = document.querySelector("#night").getBoundingClientRect();
    const ground = Math.round((d.bottom - n.top) / 4), rows = 7, top = ground - rows + 1, w = sky.width;
    const img = g.getImageData(0, top, w, rows), px = img.data;
    for (let y = 0; y < rows - 1; y++) { // the last row is the ground line: kept whole
      const count = new Map();
      for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2]; count.set(k, (count.get(k) || 0) + 1); }
      const bg = [...count].sort((a, b) => b[1] - a[1])[0][0];
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
        if (k === bg) px[i + 3] = 0;
      }
    }
    const S = 8, out = document.createElement("canvas");
    out.width = w * S; out.height = rows * S;
    const o = out.getContext("2d");
    const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = rows; tmp.getContext("2d").putImageData(img, 0, 0);
    o.imageSmoothingEnabled = false;
    o.drawImage(tmp, 0, 0, w * S, rows * S);
    return out.toDataURL("image/png").split(",")[1];
  });
  fs.writeFileSync(path.join(imgDir, "manual-ground.png"), Buffer.from(png, "base64"));
  console.log("doc/img/manual-ground.png");
} finally {
  await browser.close();
  server.kill();
}
