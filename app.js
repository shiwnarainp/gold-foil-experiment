"use strict";
/* Rutherford's Gold Foil Experiment — application logic. Depends on GoldFoilEngine (engine.js). */
const E = GoldFoilEngine;

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (attrs[k] === null || attrs[k] === undefined) continue;
    if (k === "class") node.className = attrs[k];
    else if (k === "html") node.innerHTML = attrs[k];
    else node.setAttribute(k, attrs[k]);
  }
  (children || []).forEach((c) => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return node;
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function weightedCategory() {
  const r = Math.random();
  const w = E.CATEGORY_WEIGHTS;
  if (r < w.through) return "through";
  if (r < w.through + w.deflected) return "deflected";
  return "backscattered";
}
function randomInRange([lo, hi]) { return lo + Math.random() * (hi - lo); }

/* ---------------------------------------------------------------------
   Theme toggle + persisted free-text fields
--------------------------------------------------------------------- */
(function initTheme() {
  const root = document.documentElement;
  const btn = document.getElementById("themeToggleBtn");
  let saved = null;
  try { saved = localStorage.getItem("goldfoil.theme"); } catch (e) {}
  if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  function current() { return root.getAttribute("data-theme") === "light" ? "light" : "dark"; }
  function sync() { btn.textContent = current() === "light" ? "☽ Dark mode" : "☀ Light mode"; }
  btn.addEventListener("click", function () {
    const next = current() === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("goldfoil.theme", next); } catch (e) {}
    sync();
  });
  sync();
})();
(function persistPredict() {
  const ta = document.getElementById("predict-input");
  try { const saved = localStorage.getItem("goldfoil.predict"); if (saved) ta.value = saved; } catch (e) {}
  ta.addEventListener("input", function () { try { localStorage.setItem("goldfoil.predict", ta.value); } catch (e) {} });
})();

/* ---------------------------------------------------------------------
   Shared atom-sphere renderer: Thomson's plum pudding vs. Rutherford's
   nuclear model. Used by the predict-section preview, the full
   interactive model section, and (lightly) by the split-screen patterns.
--------------------------------------------------------------------- */
function makeElectronSeeds(n) {
  const seeds = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const yv = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - yv * yv);
    const a = i * golden;
    seeds.push({ x: r * Math.cos(a), y: yv, z: r * Math.sin(a) });
  }
  return seeds;
}
const ATOM_ELECTRON_SEEDS = makeElectronSeeds(10);

function drawAtomSphere(ctx, W, H, mode, theta) {
  const cx = W / 2, cy = H / 2;
  const sphereR = Math.min(W, H) * 0.32;
  const ink = cssVar("--ink"), inkMuted = cssVar("--ink-muted");
  const nucleusColor = cssVar("--nucleus"), electronColor = cssVar("--alpha");
  ctx.clearRect(0, 0, W, H);

  const projected = ATOM_ELECTRON_SEEDS.map((p) => {
    const x2 = p.x * Math.cos(theta) - p.z * Math.sin(theta);
    const z2 = p.x * Math.sin(theta) + p.z * Math.cos(theta);
    return { x2, y: p.y, z: z2 };
  });

  if (mode === "thomson") {
    const grad = ctx.createRadialGradient(cx - 24, cy - 24, 8, cx, cy, sphereR);
    grad.addColorStop(0, nucleusColor + "cc");
    grad.addColorStop(1, nucleusColor + "22");
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.arc(cx, cy, sphereR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = nucleusColor + "55";
    ctx.beginPath();
    ctx.arc(cx, cy, sphereR, 0, Math.PI * 2);
    ctx.stroke();
    projected
      .map((p) => ({ sx: cx + p.x2 * sphereR * 0.82, sy: cy + p.y * sphereR * 0.82, z: p.z }))
      .sort((a, b) => a.z - b.z)
      .forEach((p) => {
        const scale = 0.55 + (p.z + 1) * 0.25;
        ctx.beginPath();
        ctx.fillStyle = electronColor;
        ctx.globalAlpha = 0.55 + (p.z + 1) * 0.2;
        ctx.arc(p.sx, p.sy, 6.5 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    ctx.fillStyle = ink;
    ctx.font = "12px 'Figtree', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Positive charge spread evenly", cx, cy + sphereR + 24);
  } else {
    ctx.strokeStyle = inkMuted + "66";
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, sphereR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    projected
      .map((p) => ({ sx: cx + p.x2 * sphereR * 0.95, sy: cy + p.y * sphereR * 0.95, z: p.z }))
      .sort((a, b) => a.z - b.z)
      .forEach((p) => {
        const scale = 0.55 + (p.z + 1) * 0.25;
        ctx.beginPath();
        ctx.fillStyle = electronColor;
        ctx.globalAlpha = 0.6 + (p.z + 1) * 0.2;
        ctx.arc(p.sx, p.sy, 5.5 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    ctx.beginPath();
    ctx.fillStyle = nucleusColor;
    ctx.shadowColor = nucleusColor;
    ctx.shadowBlur = 8;
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = ink;
    ctx.font = "12px 'Figtree', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Tiny dense nucleus, mostly empty space", cx, cy + sphereR + 24);
  }
}

/* small, non-interactive auto-rotating preview for the Predict section */
(function initPredictPreview() {
  const canvas = document.getElementById("predict-model-canvas");
  const ctx = canvas.getContext("2d");
  let theta = 0.3;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function loop() {
    if (!reduceMotion) theta += 0.005;
    drawAtomSphere(ctx, canvas.width, canvas.height, "thomson", theta);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

/* full interactive model section: drag to rotate, toggle Thomson/Rutherford */
(function initModelSection() {
  const canvas = document.getElementById("model-canvas");
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let mode = "rutherford";
  let theta = 0.4;
  let dragging = false;
  let lastX = 0;
  let autoRotate = !reduceMotion;

  function loop() {
    if (autoRotate && !dragging) theta += 0.006;
    drawAtomSphere(ctx, canvas.width, canvas.height, mode, theta);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  canvas.addEventListener("pointerdown", function (ev) { dragging = true; lastX = ev.clientX; canvas.setPointerCapture(ev.pointerId); });
  canvas.addEventListener("pointermove", function (ev) { if (!dragging) return; theta += (ev.clientX - lastX) * 0.012; lastX = ev.clientX; });
  ["pointerup", "pointercancel", "pointerleave"].forEach((evt) => canvas.addEventListener(evt, function () { dragging = false; }));

  const descRutherford = "Rutherford's model concentrates nearly all of an atom's mass and positive charge in a tiny, dense nucleus. Electrons occupy a much larger surrounding region that is mostly empty space — exactly what the gold foil scattering pattern required.";
  const descThomson = "Thomson's \"plum pudding\" model spread positive charge evenly through the whole atom, with electrons embedded in it. The gold foil results — especially the rare large-angle scatters — were impossible to explain with this evenly-spread picture.";

  document.getElementById("btn-model-rutherford").addEventListener("click", function () {
    mode = "rutherford";
    this.setAttribute("aria-pressed", "true");
    document.getElementById("btn-model-thomson").setAttribute("aria-pressed", "false");
    document.getElementById("model-description").textContent = descRutherford;
  });
  document.getElementById("btn-model-thomson").addEventListener("click", function () {
    mode = "thomson";
    this.setAttribute("aria-pressed", "true");
    document.getElementById("btn-model-rutherford").setAttribute("aria-pressed", "false");
    document.getElementById("model-description").textContent = descThomson;
  });
  document.getElementById("model-description").textContent = descRutherford;
})();

/* ---------------------------------------------------------------------
   Main scattering stage
--------------------------------------------------------------------- */
(function initStage() {
  const canvas = document.getElementById("stage-canvas");
  const ctx = canvas.getContext("2d");
  const W = 760, H = 380;
  const cy = H / 2;
  const sourceX = 50, shieldX = 140, spawnX = 190, foilX = 430, screenX = 700;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const nucleusFractions = [0.15, 0.32, 0.5, 0.68, 0.85];
  const nucleusYs = nucleusFractions.map((f) => 40 + f * (H - 80));

  let running = true;
  let showTrails = true;
  let showNucleus = true;
  let slowMotion = false;
  let zoomed = false;
  let discoveryRevealed = false;
  const counts = { through: 0, deflected: 0, backscattered: 0 };

  const particles = [];

  function makeParticle(category, thetaDegOverride) {
    const thetaDeg = thetaDegOverride != null ? thetaDegOverride : randomInRange(E.CATEGORY_ANGLE_RANGE[category]);
    const sign = Math.random() < 0.5 ? 1 : -1;
    let spawnY;
    if (category === "through") {
      spawnY = 40 + Math.random() * (H - 80);
    } else {
      const targetY = nucleusYs[Math.floor(Math.random() * nucleusYs.length)];
      spawnY = targetY + sign * (6 + Math.random() * 6);
    }
    const bendHalfWidth = 10;
    return {
      category,
      thetaDeg,
      sign,
      spawnY,
      bendStart: foilX - spawnX - bendHalfWidth,
      bendLength: bendHalfWidth * 2,
      s: Math.random() * 40, // stagger initial phase so a fresh batch doesn't move in lockstep
      trail: [],
      done: false,
    };
  }
  function spawnTrickle() { particles.push(makeParticle(weightedCategory())); }
  for (let i = 0; i < 5; i++) spawnTrickle();

  let flashes = []; // {y, life}
  let lastTrickle = 0;
  const backDetectorX = shieldX + 25; // a backscattered particle reverses course after the
  // bend (heading > 90 degrees means cos(heading) < 0) and heads back toward the SOURCE
  // side, not the far screen — without this zone those particles would drift forever and
  // the backscattered counter could never increment.

  function step(dt, nowMs) {
    const speed = (slowMotion ? 55 : 170) * dt;
    particles.forEach((p) => {
      if (p.done) return;
      p.trail.push(p.s);
      if (p.trail.length > 5) p.trail.shift();
      p.s += speed;
      const pos = E.pathPoint(p.s, p);
      const x = spawnX + pos.dx;
      if (x >= screenX) {
        p.done = true;
        flashes.push({ y: p.spawnY + pos.dy, x: screenX + 8, life: 1, color: p.category });
        counts[p.category]++;
        updateCounters();
      } else if (x <= backDetectorX && p.s > p.bendStart + p.bendLength) {
        p.done = true;
        flashes.push({ y: p.spawnY + pos.dy, x: backDetectorX, life: 1, color: p.category });
        counts[p.category]++;
        updateCounters();
      }
    });
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].done) particles.splice(i, 1);
    if (nowMs - lastTrickle > 380) { spawnTrickle(); lastTrickle = nowMs; }
    flashes.forEach((f) => (f.life *= 0.92));
    flashes = flashes.filter((f) => f.life > 0.04);
  }

  function updateCounters() {
    document.getElementById("count-through").textContent = String(counts.through);
    document.getElementById("count-deflected").textContent = String(counts.deflected);
    document.getElementById("count-backscattered").textContent = String(counts.backscattered);
    if (!discoveryRevealed && counts.backscattered > 0) {
      discoveryRevealed = true;
      document.getElementById("discovery-panel").classList.add("revealed");
    }
  }

  function draw() {
    const ink = cssVar("--ink"), inkMuted = cssVar("--ink-muted"), border = cssVar("--border");
    const gold = cssVar("--gold"), nucleusColor = cssVar("--nucleus"), scint = cssVar("--scintillation");
    const colorByCategory = { through: cssVar("--alpha"), deflected: cssVar("--deflected"), backscattered: cssVar("--backscatter") };
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.font = "11px 'JetBrains Mono', monospace";

    // radioactive source
    ctx.fillStyle = border;
    ctx.fillRect(sourceX - 14, cy - 18, 28, 36);
    ctx.fillStyle = inkMuted;
    ctx.fillText("Ra source", sourceX, cy - 28);

    // lead shielding with collimator slit
    ctx.fillStyle = "#3a3a3f";
    ctx.fillRect(shieldX - 8, cy - 60, 16, 50);
    ctx.fillRect(shieldX - 8, cy + 10, 16, 50);
    ctx.fillStyle = inkMuted;
    ctx.fillText("lead shield", shieldX, cy - 70);

    // gold foil
    ctx.fillStyle = gold;
    ctx.fillRect(foilX - 5, 30, 10, H - 60);
    ctx.fillStyle = inkMuted;
    ctx.fillText(zoomed ? "gold foil (zoomed)" : "gold foil", foilX, 22);

    if (showNucleus) {
      nucleusYs.forEach((ny) => {
        if (zoomed) {
          ctx.beginPath();
          ctx.strokeStyle = border;
          ctx.setLineDash([3, 4]);
          ctx.arc(foilX, ny, 34, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.fillStyle = nucleusColor;
        ctx.shadowColor = nucleusColor;
        ctx.shadowBlur = reduceMotion ? 0 : 6;
        ctx.arc(foilX, ny, zoomed ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      if (zoomed) {
        ctx.fillStyle = inkMuted;
        ctx.font = "10px 'Figtree', sans-serif";
        ctx.fillText("mostly empty space", foilX, nucleusYs[0] - 44);
      }
    }

    // detector screen (forward) — the real experiment also used a screen that could be
    // swung around toward the source side to catch rare backscattered particles; rather
    // than draw a second full screen, backscatter hits flash right where they emerge,
    // near the lead shield.
    ctx.fillStyle = cssVar("--surface-sunken");
    ctx.fillRect(screenX, 30, 16, H - 60);
    ctx.strokeStyle = border;
    ctx.strokeRect(screenX, 30, 16, H - 60);
    ctx.fillStyle = inkMuted;
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillText("ZnS screen", screenX + 8, 22);

    flashes.forEach((f) => {
      const r = 20 * f.life;
      const grad = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, r);
      grad.addColorStop(0, scint);
      grad.addColorStop(1, scint + "00");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
    });

    particles.forEach((p) => {
      const pos = E.pathPoint(p.s, p);
      const x = spawnX + pos.dx, y = p.spawnY + pos.dy;
      const color = colorByCategory[p.category];
      if (showTrails) {
        p.trail.forEach((ts, i) => {
          const tp = E.pathPoint(ts, p);
          ctx.beginPath();
          ctx.fillStyle = color;
          ctx.globalAlpha = (i / p.trail.length) * 0.5;
          ctx.arc(spawnX + tp.dx, p.spawnY + tp.dy, 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        });
      }
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = reduceMotion ? 0 : 7;
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    ctx.textAlign = "left";
  }

  let last = null;
  function loop(ts) {
    if (last == null) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (running) step(dt, ts);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  document.getElementById("btn-start-pause").addEventListener("click", function (ev) {
    running = !running;
    ev.target.textContent = running ? "⏸ Pause" : "▶ Resume";
  });
  document.getElementById("btn-reset").addEventListener("click", function () {
    particles.length = 0;
    flashes = [];
    counts.through = 0; counts.deflected = 0; counts.backscattered = 0;
    updateCounters();
    for (let i = 0; i < 5; i++) spawnTrickle();
    running = true;
    document.getElementById("btn-start-pause").textContent = "⏸ Pause";
  });
  document.getElementById("btn-launch-one").addEventListener("click", function () {
    const approach = parseInt(document.getElementById("slider-approach").value, 10);
    const thetaDeg = E.angleFromApproach(approach);
    const category = E.classifyAngle(thetaDeg);
    particles.push(makeParticle(category, thetaDeg));
  });
  document.getElementById("btn-launch-100").addEventListener("click", function () {
    for (let i = 0; i < 100; i++) {
      const p = makeParticle(weightedCategory());
      p.s -= i * 1.5; // negative start = staggered delayed entry, spreads the burst out visually
      particles.push(p);
    }
  });
  function updateApproachReadout() {
    const v = parseInt(document.getElementById("slider-approach").value, 10);
    const theta = E.angleFromApproach(v);
    document.getElementById("approach-readout").textContent =
      "Approach distance: " + v + "% of the way to a direct hit on a nucleus → about " + Math.round(theta) + "° of predicted deflection.";
  }
  document.getElementById("slider-approach").addEventListener("input", updateApproachReadout);
  updateApproachReadout();
  document.getElementById("btn-show-trails").addEventListener("click", function (ev) { showTrails = !showTrails; ev.target.setAttribute("aria-pressed", String(showTrails)); });
  document.getElementById("btn-show-nucleus").addEventListener("click", function (ev) { showNucleus = !showNucleus; ev.target.setAttribute("aria-pressed", String(showNucleus)); });
  document.getElementById("btn-slow-motion").addEventListener("click", function (ev) { slowMotion = !slowMotion; ev.target.setAttribute("aria-pressed", String(slowMotion)); });
  document.getElementById("btn-zoom").addEventListener("click", function (ev) { zoomed = !zoomed; ev.target.setAttribute("aria-pressed", String(zoomed)); });

  updateCounters();
})();

/* ---------------------------------------------------------------------
   Investigation questions (ungraded — reveal a model answer on demand)
--------------------------------------------------------------------- */
(function initInvestigation() {
  const host = document.getElementById("investigate-questions");
  E.INVESTIGATION_QUESTIONS.forEach((q, i) => {
    const wrap = el("div", { style: i > 0 ? "margin-top:16px; padding-top:16px; border-top:1px solid var(--border);" : "" });
    wrap.appendChild(el("p", { style: "font-weight:600;" }, [(i + 1) + ". " + q.prompt]));
    const ta = el("textarea", { id: "inv-" + q.id, style: "width:100%; min-height:60px; border:1px solid var(--border); border-radius:8px; padding:8px; background:var(--surface-sunken); color:var(--ink);" });
    wrap.appendChild(ta);
    try { const saved = localStorage.getItem("goldfoil.inv." + q.id); if (saved) ta.value = saved; } catch (e) {}
    const feedback = el("div", { style: "margin-top:8px;" });
    const btn = el("button", { class: "btn", style: "margin-top:8px;" }, ["Check my thinking"]);
    btn.addEventListener("click", function () {
      feedback.innerHTML = "";
      feedback.appendChild(el("div", { class: "callout info" }, ["Model answer: " + q.model]));
      try { localStorage.setItem("goldfoil.inv." + q.id, ta.value); } catch (e) {}
    });
    wrap.appendChild(btn);
    wrap.appendChild(feedback);
    host.appendChild(wrap);
  });
})();

/* ---------------------------------------------------------------------
   Split-screen predicted-vs-observed mini animations
--------------------------------------------------------------------- */
(function initSplit() {
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function makeMini(canvasId, categoryWeights) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const cy = H / 2, foilX = W * 0.55, spawnX = 20, screenX = W - 10;
    const nucleusYs = [0.3, 0.5, 0.7].map((f) => 20 + f * (H - 40));
    const particles = [];
    function weighted() {
      const r = Math.random();
      if (r < categoryWeights.through) return "through";
      if (r < categoryWeights.through + categoryWeights.deflected) return "deflected";
      return "backscattered";
    }
    function spawn() {
      const category = weighted();
      const thetaDeg = randomInRange(E.CATEGORY_ANGLE_RANGE[category]);
      const sign = Math.random() < 0.5 ? 1 : -1;
      const spawnY = category === "through" ? 20 + Math.random() * (H - 40) : nucleusYs[Math.floor(Math.random() * nucleusYs.length)] + sign * 5;
      particles.push({ category, thetaDeg, sign, spawnY, bendStart: foilX - spawnX - 6, bendLength: 12, s: 0 });
    }
    for (let i = 0; i < 3; i++) { spawn(); particles[i].s = Math.random() * 60; }
    let last = null, lastSpawn = 0;
    function loop(ts) {
      if (last == null) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      const colors = { through: cssVar("--alpha"), deflected: cssVar("--deflected"), backscattered: cssVar("--backscatter") };
      particles.forEach((p) => { p.s += 70 * dt; });
      for (let i = particles.length - 1; i >= 0; i--) {
        const pos = E.pathPoint(particles[i].s, particles[i]);
        if (spawnX + pos.dx >= screenX || spawnX + pos.dx < -20) particles.splice(i, 1);
      }
      if (ts - lastSpawn > 500) { spawn(); lastSpawn = ts; }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = cssVar("--gold");
      ctx.fillRect(foilX - 3, 15, 6, H - 30);
      ctx.fillStyle = cssVar("--nucleus");
      nucleusYs.forEach((ny) => { ctx.beginPath(); ctx.arc(foilX, ny, 2.5, 0, Math.PI * 2); ctx.fill(); });
      particles.forEach((p) => {
        const pos = E.pathPoint(p.s, p);
        ctx.beginPath();
        ctx.fillStyle = colors[p.category];
        ctx.arc(spawnX + pos.dx, p.spawnY + pos.dy, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }
  // Thomson's prediction: essentially everything passes through with negligible deflection
  makeMini("split-thomson-canvas", { through: 0.98, deflected: 0.02, backscattered: 0 });
  // What was actually observed
  makeMini("split-rutherford-canvas", E.CATEGORY_WEIGHTS);
})();

/* ---------------------------------------------------------------------
   5-question knowledge check
--------------------------------------------------------------------- */
(function initQuiz() {
  const host = document.getElementById("quiz-panel");
  const answers = {};
  function renderScore() {
    if (Object.keys(answers).length < E.QUIZ_QUESTIONS.length) return;
    const correct = Object.values(answers).filter(Boolean).length;
    let scoreEl = document.getElementById("quiz-final-score");
    if (!scoreEl) { scoreEl = el("div", { id: "quiz-final-score", style: "margin-top:16px;" }); host.appendChild(scoreEl); }
    scoreEl.innerHTML = "";
    scoreEl.appendChild(el("div", { class: "callout " + (correct === E.QUIZ_QUESTIONS.length ? "good" : "info") }, [
      el("div", { class: "quiz-score" }, ["Final score: " + correct + " / " + E.QUIZ_QUESTIONS.length]),
    ]));
  }
  E.QUIZ_QUESTIONS.forEach((q, qi) => {
    const wrap = el("div", { class: "quiz-question" });
    wrap.appendChild(el("p", { style: "font-weight:600;" }, [(qi + 1) + ". " + q.prompt]));
    q.choices.forEach((choice, ci) => {
      wrap.appendChild(el("label", {}, [
        el("input", { type: "radio", name: "quiz-" + q.id, value: String(ci), style: "margin-top:3px;" }),
        el("span", {}, [choice]),
      ]));
    });
    const feedback = el("div", { style: "margin-top:8px;" });
    const submitBtn = el("button", { class: "btn primary" }, ["Submit"]);
    submitBtn.addEventListener("click", function () {
      const checked = wrap.querySelector('input[name="quiz-' + q.id + '"]:checked');
      feedback.innerHTML = "";
      if (!checked) { feedback.appendChild(el("div", { class: "callout warn" }, ["Choose an answer first."])); return; }
      const correct = parseInt(checked.value, 10) === q.correctIndex;
      feedback.appendChild(el("div", { class: "callout " + (correct ? "good" : "critical") }, [(correct ? "✓ Correct. " : "✗ Not quite. ") + q.explanation]));
      submitBtn.disabled = true;
      wrap.querySelectorAll('input[name="quiz-' + q.id + '"]').forEach((r) => (r.disabled = true));
      answers[q.id] = correct;
      renderScore();
    });
    wrap.appendChild(submitBtn);
    wrap.appendChild(feedback);
    host.appendChild(wrap);
  });
})();
