// Runtime for the mechanical-watch figure. Runs inside the same module as the
// inlined iso-kit, so its helpers (iso, onTop, lineOnTop, lineSvg, ...) are in
// scope as bare names. CONFIG is prepended by build.mjs.

const P = CONFIG.P;
const { FREQ, BPH, BEATS, ESC_TEETH, HUB, F, BAL, PF, WHEEL_TOP, BAL_TOP, HAND_Z, Z_SPIRAL, wheels } = CONFIG;
const ZT = WHEEL_TOP + 0.5;
const ZB = BAL_TOP - 0.6;
const ZF = WHEEL_TOP + 0.8;
const ZH = HAND_Z;

const TAU = Math.PI * 2;
const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

const BASE_E = Math.atan2(F.y - PF[1], F.x - PF[0]);
const BASE_B = Math.atan2(BAL.y - PF[1], BAL.x - PF[0]);
const LEN_E = dist(PF, [F.x, F.y]) * 0.8;
const LEN_B = dist(PF, [BAL.x, BAL.y]) * 0.55;

const AMP = 2.4; // balance amplitude, radians
const FORK_AMP = 0.13;

const svg = document.querySelector(".iso-stage svg");
const stage = document.querySelector(".iso-stage");
const readout = document.querySelector("[data-readout]");
const R = {};
["barrel", "center", "third", "fourth", "escape"].forEach((id) => {
  R[id] = svg.querySelector(`[data-part="rot-${id}"]`);
});
R.balance = svg.querySelector('[data-part="balance-rot"]');
R.fork = svg.querySelector('[data-part="fork-rot"]');
R.hour = svg.querySelector('[data-part="hand-hour"]');
R.minute = svg.querySelector('[data-part="hand-minute"]');
R.second = svg.querySelector('[data-part="hand-second"]');

// ---------- per-part renderers ----------
function renderWheel(s, deg) {
  const a = (deg * Math.PI) / 180;
  const rIn = s.rRoot * 0.42;
  const rOut = s.rTip * 0.82;
  let d = "";
  for (let i = 0; i < s.spokes; i++) {
    const ang = a + (i * TAU) / s.spokes;
    d += lineOnTop(polar(s.cx, s.cy, rIn, ang), polar(s.cx, s.cy, rOut, ang), ZT, P);
  }
  const ip = iso([s.cx + rOut * Math.cos(a), s.cy + rOut * Math.sin(a), ZT], P);
  return lineSvg(d, { tone: "lo" }) + `<circle class="iso-dot-hi" cx="${ip[0].toFixed(2)}" cy="${ip[1].toFixed(2)}" r="1.3"/>`;
}

function renderBalance(ang) {
  const rHub = 7;
  const rRim = BAL.r - 7;
  const rScrew = BAL.r - 2.5;
  let d = "";
  for (let i = 0; i < 3; i++) {
    const a = ang + (i * TAU) / 3;
    d += lineOnTop(polar(BAL.x, BAL.y, rHub, a), polar(BAL.x, BAL.y, rRim, a), ZB, P);
  }
  let dots = "";
  for (let i = 0; i < 4; i++) {
    const a = ang + (i * Math.PI) / 2;
    const p = iso([BAL.x + rScrew * Math.cos(a), BAL.y + rScrew * Math.sin(a), ZB], P);
    dots += `<circle class="iso-screw" cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="2.1"/>`;
  }
  // hairspring: inner end follows the balance, outer end fixed (breathing)
  const N = 150;
  let sp = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = 8 + (BAL.r - 15) * t;
    const aa = TAU * 5 * t + ang * (1 - t);
    sp.push(polar(BAL.x, BAL.y, r, aa));
  }
  const spiral = `<path class="iso-line" data-tone="lit" d="${onTop(sp, Z_SPIRAL, P)}"/>`;
  return lineSvg(d, { tone: "hi" }) + dots + spiral;
}

function renderFork(ang) {
  const aE = BASE_E + ang;
  const aB = BASE_B + ang;
  const eEnd = polar(PF[0], PF[1], LEN_E, aE);
  const bEnd = polar(PF[0], PF[1], LEN_B, aB);
  const d = lineOnTop(PF, eEnd, ZF, P) + lineOnTop(PF, bEnd, ZF, P);
  const perp = aE + Math.PI / 2;
  const j1 = polar(eEnd[0], eEnd[1], 3, perp);
  const j2 = polar(eEnd[0], eEnd[1], -3, perp);
  let dots = "";
  [j1, j2, eEnd].forEach((p) => {
    const q = iso([p[0], p[1], ZF], P);
    dots += `<circle class="iso-jewel" cx="${q[0].toFixed(2)}" cy="${q[1].toFixed(2)}" r="1.9"/>`;
  });
  const pv = iso([PF[0], PF[1], ZF], P);
  dots += `<circle class="iso-hub" cx="${pv[0].toFixed(2)}" cy="${pv[1].toFixed(2)}" r="2.4"/>`;
  return lineSvg(d, { tone: "mid", className: "iso-fork" }) + dots;
}

function renderHand(cx, cy, len, tail, hw, deg, tone) {
  const a = (deg * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const px = -uy, py = ux; // unit vector across the hand
  // "along" is distance down the hand, "side" is the offset across it.
  const pt = (along, side) => [cx + ux * along + px * side, cy + uy * along + py * side];
  // A slender leaf: narrow tail, two shoulders, pointed tip. All five points
  // stay within a few units of the axis, so the hand never becomes a wedge.
  const poly = [
    pt(-tail, -hw * 0.62),
    pt(-tail, hw * 0.62),
    pt(len * 0.7, hw),
    pt(len, 0),
    pt(len * 0.7, -hw),
  ];
  const d = onTop(poly, ZH, P, true);
  const col = `var(--anatomy-${tone})`;
  let s = `<path style="fill:${col};stroke:${col};stroke-width:.5;stroke-linejoin:round" d="${d}"/>`;
  const pv = iso([cx, cy, ZH], P);
  s += `<circle cx="${pv[0].toFixed(2)}" cy="${pv[1].toFixed(2)}" r="2.6" style="fill:${col}"/>`;
  if (tail > 4) {
    const [wx, wy] = pt(-tail * 0.82, 0);
    const cp = iso([wx, wy, ZH], P);
    s += `<circle cx="${cp[0].toFixed(2)}" cy="${cp[1].toFixed(2)}" r="3" style="fill:${col}"/>`;
  }
  return s;
}

// ---------- state ----------
// Start at the classic 10:08:36 so the three hands are visibly separated at
// rest; at 00:00:00 they would overlap into a single stroke.
const T0 = 10 * 3600 + 8 * 60 + 36;
let simSeconds = T0; // nominal watch-seconds (scaled by speed)
let indicated = T0; // watch-seconds actually shown on the hands (drifts with freq)
let playing = true;
let speed = 0.4;
let freq = FREQ;
let power = 100;
let last = 0;
let raf = 0;
let visible = false;
let lastInteract = 0;
let tourAt = 0;
let focusName = "all";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduce) playing = false;

const pad = (n) => String(n).padStart(2, "0");
function fmtTime(s) {
  const tot = Math.floor(s);
  return `${pad(Math.floor(tot / 3600) % 24)}:${pad(Math.floor(tot / 60) % 60)}:${pad(tot % 60)}`;
}

function setFocus(name) {
  focusName = name;
  stage.setAttribute("data-focus", name);
  document.querySelectorAll("[data-focus-btn]").forEach((b) => b.classList.toggle("on", b.dataset.focusBtn === name));
  document.getElementById("mw-desc").textContent = CONFIG.desc[name];
}

function updateGauge() {
  const pct = Math.max(0, Math.min(100, power));
  document.getElementById("mw-power").style.width = pct + "%";
  document.getElementById("mw-power-num").textContent = Math.round(pct) + "%";
}

function updateReadout(fr = 0) {
  const ratio = freq / FREQ;
  const daily = Math.round((ratio - 1) * 86400);
  const sign = daily > 0 ? "+" : "";
  const ah = Math.round(BPH * ratio).toLocaleString("en-US").replace(/,/g, " ");
  // The beat dot flares the instant the escapement unlocks, then fades while
  // the train is locked — a visual echo of the "one tooth per beat" gating.
  const glow = (0.18 + 0.82 * Math.pow(1 - fr, 3)).toFixed(2);
  readout.innerHTML =
    `<span class="mw-beat" style="opacity:${glow}">●</span>${ah} A/h · ${freq.toFixed(2)} Hz<br>` +
    `滴答 ${(BEATS * ratio).toFixed(1)}/s · 动力 ${Math.round(power)}%${power <= 0 ? " · 停走" : ""}<br>` +
    `表显 ${fmtTime(indicated)} · 日差 ${sign}${daily}s`;
}

// ---------- main loop ----------
function frame(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;

  if (playing && power > 0) {
    simSeconds += dt * speed;
    indicated += dt * speed * (freq / FREQ);
    power = Math.max(0, power - dt * 0.85);
    updateGauge();
  }

  const balA = AMP * Math.sin(TAU * freq * simSeconds);
  const beatPhase = 2 * freq * simSeconds;
  const teeth = Math.floor(beatPhase);
  const fr = beatPhase - teeth;
  const ease = easeOut(Math.min(fr / 0.16, 1));
  const escDeg = (teeth + ease) * (360 / ESC_TEETH);
  const forkA = FORK_AMP * Math.sin(Math.PI * beatPhase);

  for (const s of wheels) {
    const deg = s.stepped ? escDeg : s.omega * s.dir * simSeconds;
    if (R[s.id]) R[s.id].innerHTML = renderWheel(s, deg);
  }
  if (R.balance) R.balance.innerHTML = renderBalance(balA);
  if (R.fork) R.fork.innerHTML = renderFork(forkA);

  const secA = 360 * (indicated / 60);
  const minA = 360 * (indicated / 3600);
  const hrA = 360 * (indicated / 43200);
  if (R.hour) R.hour.innerHTML = renderHand(HUB[0], HUB[1], 30, 4, 2.6, hrA, "hi");
  if (R.minute) R.minute.innerHTML = renderHand(HUB[0], HUB[1], 42, 5, 2.1, minA, "hi");
  if (R.second) R.second.innerHTML = renderHand(F.x, F.y, 22, 9, 1.2, secA, "mid");

  updateReadout(fr);

  // idle tour
  if (playing && visible && now - lastInteract > 9000 && now > tourAt) {
    const order = ["all", "power", "train", "escape", "osc", "display"];
    setFocus(order[(order.indexOf(focusName) + 1) % order.length]);
    tourAt = now + 5000;
    lastInteract = now; // avoid immediate re-trigger
  }

  if (playing && visible) raf = requestAnimationFrame(frame);
  else raf = 0;
}

function start() {
  if (!raf && playing && visible) {
    last = 0;
    raf = requestAnimationFrame(frame);
  }
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

new IntersectionObserver((e) => {
  visible = e[e.length - 1].isIntersecting;
  if (visible) start();
  else stop();
}).observe(stage);

// ---------- controls ----------
const playBtn = document.getElementById("mw-play");
playBtn.textContent = playing ? "⏸ 暂停" : "▶ 播放";
playBtn.addEventListener("click", () => {
  playing = !playing;
  playBtn.textContent = playing ? "⏸ 暂停" : "▶ 播放";
  lastInteract = performance.now();
  if (playing) start();
  else stop();
});

document.getElementById("mw-wind").addEventListener("click", () => {
  power = Math.min(100, power + 60);
  updateGauge();
  lastInteract = performance.now();
  if (playing) start();
});

const speedEl = document.getElementById("mw-speed");
const speedNum = document.getElementById("mw-speed-num");
function setSpeed(v) {
  speed = v;
  speedEl.value = v;
  speedNum.textContent = v.toFixed(2) + "×";
}
speedEl.addEventListener("input", () => {
  setSpeed(parseFloat(speedEl.value));
  lastInteract = performance.now();
});

const regEl = document.getElementById("mw-reg");
const regNum = document.getElementById("mw-reg-num");
regEl.addEventListener("input", () => {
  const r = parseFloat(regEl.value);
  freq = FREQ * (1 + r);
  const daily = Math.round((freq / FREQ - 1) * 86400);
  regNum.textContent = "日差 " + (daily > 0 ? "+" : "") + daily + " s";
  lastInteract = performance.now();
});

document.querySelectorAll("[data-focus-btn]").forEach((b) => {
  b.addEventListener("click", () => {
    setFocus(b.dataset.focusBtn);
    lastInteract = performance.now();
  });
});

// drag horizontally on the stage to scrub speed
let dragging = false;
stage.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastInteract = performance.now();
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const box = svg.getBoundingClientRect();
  const share = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
  setSpeed(0.03 + share * (2 - 0.03));
});
stage.addEventListener("pointerup", () => (dragging = false));
stage.addEventListener("pointercancel", () => (dragging = false));

document.addEventListener("keydown", (e) => {
  if (e.target === stage || e.target === document.body) {
    if (e.code === "Space") {
      e.preventDefault();
      playing = !playing;
      playBtn.textContent = playing ? "⏸ 暂停" : "▶ 播放";
      lastInteract = performance.now();
      if (playing) start();
      else stop();
    }
  }
});

// init
setFocus("all");
updateGauge();
setSpeed(0.4);
// render one static frame immediately, then start the loop
last = 0;
frame(performance.now());
if (playing && visible) raf = requestAnimationFrame(frame);
