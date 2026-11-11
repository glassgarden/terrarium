// terrarium's scene behind the device on the web page (norns-web's NornsWeb.sky; a norns never
// loads it): inside the jar, the same world the screen draws. What lives in each part comes from
// its param (weather, soil, water, air, hum), the day from the day setting (off: the garden at
// night), and every note lands where the jar says it did (its pan), beside the device: a splash,
// a glint in the snow, a bolt in a storm; plants near it light up, the pond ripples.
//
// Drawn in chunky pixels (one is 4 CSS pixels). The sky, the glass and the earth are painted into
// a picture of their own, again only when the light changes; a frame is that picture, then what
// moves.
(() => {
  const NW = window.NornsWeb;
  if (!NW) return;

  const KINDS = { // each part's choices, in the order of its param (LAYERS in terrarium.lua)
    brain: ["rain", "lightning", "snow"],
    voice: ["meadow", "crystals", "reeds", "visitors"],
    color: ["pond", "fog"],
    air: ["clouds", "fireflies", "mountains"],
    drone: ["aurora", "roots", "none"],
  };
  const DAY_PERIOD = [null, 20 * 60, 60 * 60, "clock"]; // t_day: off, 20 min, 1 hour, clock

  // the sky at the hours of a day: top, high, low, horizon; kept dark up high, so the page's light
  // text over it stays readable
  const NIGHT = ["#08110f", "#0c1915", "#11231d", "#183026"];
  const DAWN = ["#0f1c1f", "#1f3a44", "#56787a", "#e2b37c"];
  const DAY = ["#0f2a27", "#183a34", "#5a8c80", "#cfe4c4"];
  const DUSK = ["#101a22", "#24304a", "#6a5070", "#e09a68"];
  const HOURS = [[0, NIGHT], [4.5, NIGHT], [6.5, DAWN], [9, DAY], [16, DAY], [18.8, DUSK], [21, NIGHT], [24, NIGHT]];
  const LIGHT = [[0, 0], [4.5, 0], [6.5, 0.55], [9, 1], [16, 1], [18.8, 0.6], [21, 0], [24, 0]];
  const STOPS = [0, 0.45, 0.8, 1];

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
  const css = (c, a = 1) => `rgba(${c.map((v) => Math.round(v)).join(",")},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const PAL = HOURS.map(([h, p]) => [h, p.map(rgb)]);
  function at(table, h, lerp) {
    for (let i = 1; i < table.length; i++)
      if (h <= table[i][0]) {
        const [h0, a] = table[i - 1], [h1, b] = table[i];
        return lerp(a, b, (h - h0) / (h1 - h0 || 1));
      }
    return table[table.length - 1][1];
  }
  const skyAt = (h) => at(PAL, h, (a, b, f) => a.map((c, i) => mix(c, b[i], f)));
  const lightAt = (h) => at(LIGHT, h, (a, b, f) => a + (b - a) * f);
  const rand = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const param = (id, dflt) => { const v = NW.param && NW.param(id); return typeof v === "number" ? v : dflt; };
  const kind = (part) => KINDS[part][Math.round(param(part + "_kind", 1)) - 1] || KINDS[part][0];

  // ---- the jar's state, shared by both skies ----
  const live = {
    last: 0,
    phase: 0.25,   // the jar's day, as daylight.lua has it: 0 dawn, .25 noon, .5 dusk, .75 midnight
    hour: 21, shownHour: 21,
    rate: 0,       // notes a second, smoothed: how hard it's raining
    notes: [],     // { u (0..1 across the jar), accent, t }
    flash: 0,      // the sky lit by lightning
  };
  const hourOf = (phase) => (phase * 24 + 6) % 24;

  function step(t) {
    const dt = Math.min(0.25, live.last ? (t - live.last) / 1000 : 0);
    live.last = t;
    const day = DAY_PERIOD[Math.round(param("t_day", 1)) - 1];
    if (day === "clock") {
      const d = new Date();
      live.phase = (((d.getHours() + d.getMinutes() / 60 - 6) / 24) % 1 + 1) % 1;
    } else if (day) live.phase = (live.phase + dt / day) % 1;
    live.hour = day ? hourOf(live.phase) : 23; // day off: the garden at night, as it always was
    let d = live.hour - live.shownHour;
    if (d > 12) d -= 24; else if (d < -12) d += 24;
    live.shownHour = (live.shownHour + d * Math.min(1, dt / 1.5) + 24) % 24;
    live.rate *= Math.exp(-dt / 4);
    live.flash *= Math.exp(-dt / 0.12);
    live.notes = live.notes.filter((n) => t - n.t < 2500);
    return dt;
  }

  // a place across the jar (0..1, as the screen has it) to a column beside the device: the left
  // half of the jar to the left of it, the right half to the right (the middle of the page is the
  // device, and a note's pan says which side you hear it on)
  function column(view, u) {
    const { cols, device } = view;
    const l = Math.max(2, device ? device.left - 2 : cols / 2), r = Math.min(cols - 2, device ? device.right + 2 : cols / 2);
    return u < 0.5 ? Math.round(1 + (u / 0.5) * (l - 2)) : Math.round(r + ((u - 0.5) / 0.5) * (cols - 2 - r));
  }

  // ---- one canvas: its picture, its plants, its particles ----
  function build(view) {
    const { cols, rows, ground } = view, r = rand(23);
    view.bg = view.bg || document.createElement("canvas");
    view.bg.width = cols; view.bg.height = rows;
    view.bgAt = null;
    view.stars = [];
    for (let i = 0; i < (cols * ground) / 240; i++)
      view.stars.push({ x: Math.floor(r() * cols), y: Math.floor(r() * ground * 0.75), l: 0.25 + r() * 0.6, tw: 0.4 + r() * 1.4, ph: r() * 6.28 });
    // the soil's plants, one set for every kind, so swapping parts swaps the scene
    view.plants = [];
    for (let x = 0; x < cols; x += 1 + Math.floor(r() * 2))
      view.plants.push({ x, h: r(), tone: r(), ph: r() * 6.28, flower: r() < 0.22, hue: Math.floor(r() * 3), lit: 0 });
    view.crystals = [];
    for (let x = 2; x < cols; x += 4 + Math.floor(r() * 7))
      view.crystals.push({ x, h: 3 + Math.floor(r() * 7), lean: r() < 0.5 ? -1 : 1, hue: r(), lit: 0 });
    view.reeds = [];
    for (let x = 1; x < cols; x += 2 + Math.floor(r() * 4))
      view.reeds.push({ x, h: 6 + Math.floor(r() * 9), ph: r() * 6.28, head: r() < 0.6, lit: 0 });
    view.visitors = [];
    for (let x = 6; x < cols; x += 14 + Math.floor(r() * 22))
      view.visitors.push({ x, hue: r(), blink: r() * 6.28, lit: 0 });
    view.clouds = [];
    for (let i = 0; i < Math.max(3, cols / 70); i++)
      view.clouds.push({ x: r() * cols, y: 4 + r() * ground * 0.5, w: 10 + Math.floor(r() * 18), s: 0.4 + r() * 0.8, seed: Math.floor(r() * 1e6) });
    view.flies = [];
    for (let i = 0; i < Math.max(8, (cols * ground) / 900); i++)
      view.flies.push({ x: r() * cols, y: ground * (0.35 + r() * 0.6), ph: r() * 6.28, f: 0.2 + r() * 0.5, blink: 0.3 + r() * 0.8 });
    view.roots = [];
    for (let x = 4; x < cols; x += 9 + Math.floor(r() * 12)) {
      const path = []; let px = x;
      for (let y = 1; y < 22; y++) { if (r() < 0.35) px += r() < 0.5 ? -1 : 1; path.push(px); }
      view.roots.push({ path, len: 8 + Math.floor(r() * 14), ph: r() });
    }
    view.drops = [];
    view.flakes = [];
    for (let i = 0; i < (cols * ground) / 260; i++)
      view.flakes.push({ x: r() * cols, y: r() * ground, s: 0.5 + r(), ph: r() * 6.28 });
    view.ridges = [[], []];
    for (let k = 0; k < 2; k++) {
      let y = 0, v = 0;
      for (let x = 0; x < cols; x++) {
        v += (r() - 0.5) * 0.9 - y * 0.03; v = Math.max(-1.4, Math.min(1.4, v)); y += v;
        view.ridges[k].push(y);
      }
    }
  }

  // the sky, sun or moon, the glass and the earth, into the canvas's own picture
  function paintBg(view, h, parts) {
    const { cols, rows, ground, bg } = view;
    const g = bg.getContext("2d");
    const pal = skyAt(h), light = lightAt(h);
    for (let y = 0; y < Math.min(rows, ground); y++) {
      const v = y / Math.max(1, ground - 1);
      let i = 1;
      while (i < STOPS.length - 1 && v > STOPS[i]) i++;
      const f = Math.min(1, Math.max(0, (v - STOPS[i - 1]) / (STOPS[i] - STOPS[i - 1])));
      g.fillStyle = css(mix(pal[i - 1], pal[i], f));
      g.fillRect(0, y, cols, 1);
    }
    // the sun or the moon, along daylight.lua's arc (only when the jar has a day)
    if (parts.day) {
      const p = live.phase, u = (p % 0.5) / 0.5;
      const x = Math.round(cols * (0.08 + 0.84 * u)), y = Math.round(ground - 4 - Math.sin(u * Math.PI) * ground * 0.34);
      const sun = p < 0.5, rad = sun ? 3 : 2;
      g.fillStyle = sun ? css(mix(rgb("#ffcf7a"), rgb("#fff6d8"), Math.sin(u * Math.PI)), 0.95) : css(rgb("#e4ecdf"), 0.9);
      for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++)
          if (dx * dx + dy * dy <= rad * rad + 1 && y + dy < ground) g.fillRect(x + dx, y + dy, 1, 1);
      if (!sun) {
        g.fillStyle = css(mix(pal[0], pal[1], Math.min(1, y / ground / 0.45)));
        for (let dy = -rad; dy <= rad; dy++)
          for (let dx = -rad; dx <= rad; dx++)
            if ((dx - 1) ** 2 + dy * dy <= rad * rad - 1) g.fillRect(x + dx + 1, y + dy - 1, 1, 1);
      }
    }
    // mountains: two ridges on the horizon, the far one paler
    if (parts.air === "mountains")
      for (let k = 0; k < 2; k++) {
        const base = ground - 2 - (k === 0 ? 10 : 4), c = mix(pal[3], mix(rgb("#0c1a16"), rgb("#2c4a40"), light * 0.7), k === 0 ? 0.45 : 0.8);
        g.fillStyle = css(c);
        for (let x = 0; x < cols; x++) {
          const top = Math.round(base - Math.abs(view.ridges[k][x]) * (k === 0 ? 2.2 : 1.4) - (k === 0 ? 6 : 2));
          g.fillRect(x, top, 1, ground - top);
        }
      }
    // the earth: the pond's band first if there is one, then loam with pebbles
    const pondRows = parts.color === "pond" ? 6 : 0;
    for (let y = ground; y < rows; y++) {
      const v = (y - ground) / Math.max(1, rows - ground);
      let c;
      if (y - ground < pondRows) c = mix(mix(rgb("#0e2a2c"), rgb("#2c6a6a"), light * 0.6), pal[3], 0.12 * (1 - (y - ground) / pondRows));
      else c = mix(mix(rgb("#16120d"), rgb("#2a2117"), light * 0.5), rgb("#090706"), Math.min(1, v * 1.3));
      g.fillStyle = css(c);
      g.fillRect(0, y, cols, 1);
    }
    const r = rand(9);
    g.fillStyle = css(mix(rgb("#2a231a"), rgb("#4a3e2c"), light), 0.8);
    for (let y = ground + pondRows + 2; y < Math.min(rows, ground + pondRows + 14); y += 2 + Math.floor(r() * 3))
      for (let x = Math.floor(r() * 30); x < cols; x += 10 + Math.floor(r() * 30)) g.fillRect(x, y, 1 + Math.floor(r() * 2), 1);
    // the glass: the jar's curve catching the light near its sides
    for (const [x0, w, a] of [[2, 2, 0.07], [5, 1, 0.04], [cols - 4, 1, 0.05]])
      for (let y = 2; y < ground - 1; y++) {
        const fade = Math.sin((y / ground) * Math.PI);
        g.fillStyle = `rgba(220,245,235,${(a * fade).toFixed(3)})`;
        g.fillRect(x0, y, w, 1);
      }
  }

  function lightUp(list, x, reach, amount) {
    for (const p of list) { const d = Math.abs(p.x - x); if (d <= reach) p.lit = Math.max(p.lit, amount * (1 - d / (reach + 1))); }
  }

  NW.sky = {
    fps: 15,
    layout(view) {
      if (!view.cols || !view.rows) return;
      build(view);
    },
    draw(g, t, view) {
      if (!view.cols) return;
      if (live.stepT !== t) { live.dt = step(t); live.stepT = t; } // the jar steps once a frame
      const dt = view.still ? 0 : live.dt;
      const parts = {};
      for (const k in KINDS) parts[k] = kind(k);
      parts.day = !!DAY_PERIOD[Math.round(param("t_day", 1)) - 1];
      const frozen = param("air_freeze", 1) > 1.5, hushed = param("drone_hush", 1) > 1.5;
      const h = live.shownHour, light = lightAt(h), still = view.still;
      // the picture again when the parts in it change, or the light (or the sun) has moved
      parts.key = `${parts.air}/${parts.color}/${parts.day}`;
      const b = view.bgAt;
      if (!b || b.key !== parts.key || Math.abs(b.h - h) > 0.04 || (parts.day && Math.abs(b.phase - live.phase) > 0.002)) {
        paintBg(view, h, parts);
        view.bgAt = { key: parts.key, h, phase: live.phase };
      }
      const { cols, rows, ground } = view, ts = t / 1000;
      g.clearRect(0, 0, cols, rows);
      g.drawImage(view.bg, 0, 0);

      // the notes since the last frame, onto this canvas
      for (const n of live.notes)
        if (!n.seen || !n.seen.has(view)) {
          (n.seen = n.seen || new Set()).add(view);
          const x = column(view, n.u);
          n.x = n.x || new Map(); n.x.set(view, x);
          const list = { meadow: view.plants, crystals: view.crystals, reeds: view.reeds, visitors: view.visitors }[parts.voice];
          lightUp(list, x, parts.voice === "visitors" ? 14 : 4, 0.6 + 0.4 * n.accent);
          if (parts.brain === "lightning") live.flash = Math.max(live.flash, 0.5 + 0.5 * n.accent);
        }

      // stars, and the lightning's flash over the whole sky
      if (light < 0.9)
        for (const s of view.stars) {
          const a = s.l * (1 - light) * (still ? 1 : 0.6 + 0.4 * Math.sin(ts * s.tw + s.ph));
          g.fillStyle = `rgba(214,236,224,${a.toFixed(2)})`;
          g.fillRect(s.x, s.y, 1, 1);
        }
      if (live.flash > 0.02) { g.fillStyle = `rgba(210,230,255,${(live.flash * 0.22).toFixed(3)})`; g.fillRect(0, 0, cols, ground); }

      // hum: an aurora over it all, or roots under the ground
      const hum = hushed ? 0.15 : 1;
      if (parts.drone === "aurora")
        for (let x = 0; x < cols; x++) {
          const w = Math.sin(x * 0.045 + ts * 0.35) + Math.sin(x * 0.11 - ts * 0.2) * 0.6;
          const top = Math.round(4 + w * 3), len = Math.round(10 + (Math.sin(x * 0.07 + ts * 0.5) + 1) * 7);
          const c = mix(rgb("#4be3a0"), rgb("#9a7cf0"), (Math.sin(x * 0.02 + ts * 0.15) + 1) / 2);
          for (let y = 0; y < len; y += 1) {
            g.fillStyle = css(c, hum * 0.22 * (1 - y / len) * (0.6 + 0.4 * Math.sin(x * 0.3 + ts)));
            g.fillRect(x, top + y, 1, 1);
          }
        }

      // air: clouds drifting, fireflies wandering (both hold still when frozen)
      if (parts.air === "clouds")
        for (const c of view.clouds) {
          if (!frozen) c.x = (c.x + c.s * dt * 1.5) % (cols + c.w);
          const r = rand(c.seed), col = mix(skyAt(h)[2], rgb("#e8f2ec"), 0.35 + light * 0.4);
          for (let i = 0; i < c.w; i++) {
            const hgt = Math.round(2 + Math.sin((i / c.w) * Math.PI) * 3 + r() * 1.5);
            g.fillStyle = css(col, 0.14 + light * 0.08);
            g.fillRect(Math.round(c.x - c.w + i), Math.round(c.y - hgt / 2), 1, hgt);
          }
        }
      if (parts.air === "fireflies")
        for (const f of view.flies) {
          if (!frozen && !still) {
            f.x += Math.sin(ts * f.f + f.ph) * dt * 2.5; f.y += Math.cos(ts * f.f * 1.3 + f.ph) * dt * 1.6;
            f.x = (f.x + cols) % cols; f.y = Math.max(ground * 0.3, Math.min(ground - 2, f.y));
          }
          const on = Math.max(0, Math.sin(ts * f.blink + f.ph));
          const a = on * (0.35 + 0.6 * (1 - light));
          if (a < 0.05) continue;
          g.fillStyle = css(rgb("#ffd36a"), a); g.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
          g.fillStyle = css(rgb("#ffd36a"), a * 0.25);
          g.fillRect(Math.round(f.x) - 1, Math.round(f.y), 1, 1); g.fillRect(Math.round(f.x) + 1, Math.round(f.y), 1, 1);
        }

      // weather: rain or snow as hard as the notes come; lightning strikes where they land
      const heavy = Math.min(1, live.rate / 4);
      if (parts.brain === "rain" && !still) {
        const spawn = (2 + heavy * 28) * dt * (cols / 200);
        for (let i = 0; i < spawn + (Math.random() < spawn % 1 ? 1 : 0); i++)
          view.drops.push({ x: Math.random() * cols, y: -2, v: 55 + Math.random() * 25 });
      }
      const rainC = mix(rgb("#9cc6c0"), rgb("#d8efe8"), light);
      view.drops = view.drops.filter((d) => {
        d.y += d.v * dt;
        if (d.y >= ground - 1) return false;
        g.fillStyle = css(rainC, 0.35); g.fillRect(Math.round(d.x), Math.round(d.y), 1, 2);
        return parts.brain === "rain";
      });
      if (parts.brain === "snow")
        for (const f of view.flakes) {
          if (!still) {
            f.y += (2.5 + f.s * 3 + heavy * 4) * dt; f.x += Math.sin(ts * 0.6 + f.ph) * dt * 2;
            if (f.y >= ground - 1) { f.y = -1; f.x = Math.random() * cols; }
          }
          g.fillStyle = `rgba(240,248,245,${(0.35 + f.s * 0.3).toFixed(2)})`;
          g.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
        }

      // soil: the plants along the ground, swaying, lit where notes land
      const decay = Math.exp(-dt / 0.9);
      const sway = (x, ph) => (still ? 0 : Math.round(Math.sin(ts * 0.9 + x * 0.15 + ph) * 0.6));
      if (parts.voice === "meadow") {
        const grass = mix(rgb("#1d3a26"), rgb("#4f8a4a"), 0.2 + light * 0.8);
        const petals = [rgb("#ef8fb0"), rgb("#f4f0e2"), rgb("#f2c95a")];
        for (const p of view.plants) {
          const hgt = 1 + Math.round(p.h * 3);
          g.fillStyle = css(mix(grass, rgb("#0d1a12"), p.tone * 0.4));
          g.fillRect(p.x, ground - hgt, 1, hgt);
          if (p.flower) {
            const c = mix(mix(petals[p.hue], rgb("#3a3040"), (1 - light) * 0.45), rgb("#fff8e8"), p.lit);
            g.fillStyle = css(c, 0.85 + p.lit * 0.15);
            g.fillRect(p.x + sway(p.x, p.ph), ground - hgt - 2, 1, 1);
            if (p.lit > 0.1) { g.fillStyle = css(c, p.lit * 0.35); g.fillRect(p.x - 1 + sway(p.x, p.ph), ground - hgt - 3, 3, 3); }
          }
          p.lit *= decay;
        }
      } else if (parts.voice === "crystals") {
        for (const c of view.crystals) {
          const base = mix(rgb("#3d6f8a"), rgb("#8a6fc8"), c.hue), col = mix(mix(base, rgb("#0e1a20"), (1 - light) * 0.35), rgb("#eaffff"), c.lit);
          for (let y = 0; y < c.h; y++) {
            const w = y < c.h - 2 ? 2 : 1, xo = Math.round((y / c.h) * c.lean);
            g.fillStyle = css(col, 0.85); g.fillRect(c.x + xo, ground - 1 - y, w, 1);
          }
          g.fillStyle = css(rgb("#ffffff"), 0.25 + c.lit * 0.75); g.fillRect(c.x + c.lean, ground - c.h, 1, 1);
          c.lit *= decay;
        }
      } else if (parts.voice === "reeds") {
        const stem = mix(rgb("#2a3a22"), rgb("#7a8a4a"), 0.25 + light * 0.75);
        for (const r0 of view.reeds) {
          const s = still ? 0 : Math.sin(ts * 0.7 + r0.ph) * 1.2;
          for (let y = 0; y < r0.h; y++) {
            g.fillStyle = css(mix(stem, rgb("#e8f0c8"), r0.lit * 0.6));
            g.fillRect(r0.x + Math.round((s * y) / r0.h), ground - 1 - y, 1, 1);
          }
          if (r0.head) { g.fillStyle = css(mix(rgb("#5a3a20"), rgb("#f0d090"), r0.lit)); g.fillRect(r0.x + Math.round(s), ground - r0.h - 2, 1, 3); }
          r0.lit *= decay;
        }
      } else if (parts.voice === "visitors") {
        for (const v of view.visitors) {
          const body = mix(mix(rgb("#3a5a4a"), rgb("#6a4a6a"), v.hue), rgb("#ffe9a8"), v.lit);
          g.fillStyle = css(body); g.fillRect(v.x, ground - 3, 3, 3); g.fillRect(v.x + 1, ground - 4, 1, 1);
          const open = still || Math.sin(ts * 0.5 + v.blink) > -0.95;
          if (open) { g.fillStyle = css(rgb("#f4fff8"), 0.9); g.fillRect(v.x, ground - 3, 1, 1); g.fillRect(v.x + 2, ground - 3, 1, 1); }
          if (v.lit > 0.1) { g.fillStyle = css(rgb("#ffe9a8"), v.lit * 0.2); g.fillRect(v.x - 2, ground - 6, 7, 6); }
          v.lit *= decay;
        }
      }
      // the ground line
      g.fillStyle = css(mix(rgb("#22352a"), rgb("#5c7a5a"), light));
      g.fillRect(0, ground, cols, 1);

      // water: fog low over the ground, or the pond's ripples
      if (parts.color === "fog")
        for (let k = 0; k < 3; k++) {
          const y0 = ground - 3 - k * 4;
          for (let x = 0; x < cols; x += 2) {
            const a = 0.05 + 0.05 * Math.sin(x * 0.04 + ts * (0.15 + k * 0.05) + k * 2);
            g.fillStyle = `rgba(200,225,215,${Math.max(0, a).toFixed(3)})`;
            g.fillRect(x, y0, 2, 3);
          }
        }

      // the notes: where each one lands
      for (const n of live.notes) {
        const x = n.x.get(view), age = (t - n.t) / 1000;
        if (x === undefined || age < 0) continue;
        if (parts.brain === "lightning" && age < 0.25) { // a bolt down from the sky
          g.fillStyle = css(rgb("#eef4ff"), (1 - age / 0.25) * (0.6 + 0.4 * n.accent));
          let bx = x;
          const r = rand(n.seed);
          for (let y = 2; y < ground; y++) { if (r() < 0.3) bx += r() < 0.5 ? -1 : 1; g.fillRect(bx, y, 1, 1); }
        }
        if (age < 0.9) { // the splash (a glint, in snow)
          const a = (1 - age / 0.9) * (0.5 + 0.5 * n.accent);
          const c = parts.brain === "snow" ? rgb("#ffffff") : rainC;
          const s = Math.round(1 + age * 5);
          g.fillStyle = css(c, a);
          g.fillRect(x - s, ground - 1, 1, 1); g.fillRect(x + s, ground - 1, 1, 1);
          if (age < 0.3) g.fillRect(x, ground - 1 - Math.round(age * 8), 1, 1);
        }
        if (parts.color === "pond" && age < 2.2) { // rings on the water
          const s = Math.round(1 + age * 7), a = (1 - age / 2.2) * 0.55;
          g.fillStyle = css(rgb("#bfeee6"), a);
          g.fillRect(x - s, ground + 2, Math.max(1, Math.round(s * 0.6)), 1);
          g.fillRect(x + s - Math.max(1, Math.round(s * 0.6)) + 1, ground + 2, Math.max(1, Math.round(s * 0.6)), 1);
        }
      }
      if (parts.color === "pond") // the light on the water, moving slowly
        for (let x = 0; x < cols; x += 3) {
          const a = 0.08 + 0.08 * Math.sin(x * 0.2 + ts * 0.8);
          g.fillStyle = css(mix(rgb("#7fc8c0"), skyAt(h)[3], 0.4), a);
          g.fillRect(x, ground + 1 + ((x / 3) % 3 === 0 ? 2 : 0), 2, 1);
        }
      if (parts.drone === "roots") {
        const pondRows = parts.color === "pond" ? 6 : 0;
        for (const rt of view.roots) {
          for (let i = 0; i < rt.len; i++) {
            const y = ground + pondRows + 1 + i;
            if (y >= rows) break;
            const pulse = still ? 0 : Math.max(0, Math.sin((i / rt.len) * 6 - ts * 1.6 + rt.ph * 6));
            g.fillStyle = css(mix(rgb("#4a3b28"), rgb("#f2d48a"), pulse * 0.8 * hum), 0.55 + pulse * 0.4 * hum);
            g.fillRect(rt.path[i], y, 1, 1);
          }
        }
      }
    },
    // the stand-in, on every note: where it landed (its pan, as terrarium.lua makes it from x)
    note(pan, accent) {
      const u = Math.max(0, Math.min(1, (pan / 0.6 + 1) / 2));
      live.notes.push({ u, accent: accent || 0, t: performance.now(), seed: 1 + Math.floor(Math.random() * 2147483646) });
      live.rate += 1;
    },
  };
})();
