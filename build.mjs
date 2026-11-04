import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../../.workbuddy/skills/anatomy/kit/iso-kit.mjs";
import { kitScript } from "../../../.workbuddy/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 800;
// The projected movement is ~1.9:1 wide; a tall viewBox only adds dead space
// above and below the figure, so match the canvas to the subject.
const HEIGHT = 460;

// ---- The single source of truth: a representative 28,800 vph movement ----
const FREQ = 4; // balance oscillation frequency, Hz
const BPH = 28800; // beats per hour
const BEATS = 8; // beats per second (2 per oscillation)
const ESC_TEETH = 20; // escape-wheel teeth

// ---- Z stack (z up) ----
const PLATE_BOTTOM = -5;
const PLATE_H = 7;
const PLATE_TOP = 0 + PLATE_H; // 7
const WHEEL_Z = PLATE_TOP;
const WHEEL_H = 5;
const WHEEL_TOP = WHEEL_Z + WHEEL_H; // 12
const BRIDGE_Z = WHEEL_TOP;
const BRIDGE_H = 4;
const BRIDGE_TOP = BRIDGE_Z + BRIDGE_H;
const CHAPTER_Z = WHEEL_TOP + 1; // 13
const BAL_Z = WHEEL_TOP + 3; // 15, balance raised by its cock
const BAL_H = 5;
const BAL_TOP = BAL_Z + BAL_H; // 20
const COCK_Z = BAL_TOP - 1;
const COCK_H = 4;
const CROWN_Z = PLATE_TOP;
const CROWN_H = 16;
const HAND_Z = BAL_TOP + 2; // 22

// ---- Layout on the main plate (x right, y toward viewer) ----
const PLATE = { x: -135, y: -112, w: 270, d: 276, r: 16 };
const HUB = [0, -34]; // dial centre = centre-wheel arbor
const B = { id: "barrel", x: -82, y: -62, rTip: 52, rRoot: 44, teeth: 64, omega: 360 / (6 * 3600), dir: -1, spokes: 6 }; // mainspring barrel
const C = { id: "center", x: 0, y: -34, rTip: 36, rRoot: 30, teeth: 48, omega: 360 / 3600, dir: 1, spokes: 4 }; // centre wheel (minutes)
const T = { id: "third", x: -38, y: 20, rTip: 26, rRoot: 21, teeth: 34, omega: 360 / (6 * 60), dir: -1, spokes: 4 }; // third wheel
const F = { id: "fourth", x: 46, y: 38, rTip: 24, rRoot: 19, teeth: 32, omega: 360 / 60, dir: 1, spokes: 4 }; // fourth wheel (seconds)
const E = { id: "escape", x: 16, y: 80, rTip: 18, rRoot: 13, teeth: ESC_TEETH, omega: 360 * (BEATS / ESC_TEETH), dir: -1, spokes: 5, stepped: true }; // escape wheel
const PF = [-16, 64]; // pallet-fork pivot
const BAL = { x: 8, y: 108, r: 48 }; // balance wheel (the heart)
const CROWN = [124, -14]; // winding crown

// ---- Projection ----
const fitPts = [
  ...k.boxCorners(PLATE, PLATE_BOTTOM, 0),
  ...k.boxCorners(PLATE, 0, PLATE_TOP),
  [B.x - B.rTip, B.y - B.rTip, PLATE_TOP],
  [B.x + B.rTip, B.y + B.rTip, PLATE_TOP],
  [BAL.x - BAL.r, BAL.y - BAL.r, BAL_TOP],
  [BAL.x + BAL.r, BAL.y + BAL.r, BAL_TOP],
  [CROWN[0], CROWN[1], CROWN_Z + CROWN_H],
];
const P = k.fitProjection(fitPts, WIDTH, HEIGHT, { pad: 24, azimuth: 42, elevation: 30 });

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const onTop = (pts, z) => k.onTop(pts, z, P);
const topRing = (cx, cy, r, z, steps = 56) => k.ring(cx, cy, r, z, P, steps);

// ---- Geometry helpers ----
function gearRing(cx, cy, rRoot, rTip, teeth, ang = 0) {
  const out = [];
  const step = (2 * Math.PI) / teeth;
  for (let i = 0; i < teeth; i++) {
    const b = ang + i * step;
    out.push(polar(cx, cy, rRoot, b));
    out.push(polar(cx, cy, rRoot, b + 0.18 * step));
    out.push(polar(cx, cy, rTip, b + 0.3 * step));
    out.push(polar(cx, cy, rTip, b + 0.62 * step));
    out.push(polar(cx, cy, rRoot, b + 0.74 * step));
  }
  return out;
}
function annulusRing(cx, cy, rIn, rOut, steps = 72) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    out.push([cx + rOut * Math.cos(a), cy + rOut * Math.sin(a)]);
  }
  for (let i = steps - 1; i >= 0; i--) {
    const a = (i / steps) * 2 * Math.PI;
    out.push([cx + rIn * Math.cos(a), cy + rIn * Math.sin(a)]);
  }
  return out;
}
function barFootprint(p0, p1, w) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * (w / 2), ny = (dx / L) * (w / 2);
  return [
    [p0[0] + nx, p0[1] + ny],
    [p1[0] + nx, p1[1] + ny],
    [p1[0] - nx, p1[1] - ny],
    [p0[0] - nx, p0[1] - ny],
  ];
}
const bar = (p0, p1, w, z, h, tone = "mid") =>
  S(k.extrude(barFootprint(p0, p1, w), z, h, P, { bevel: 0.6 }), { tone });
const gearSolid = (cx, cy, rRoot, rTip, teeth, z, h, tone = "mid") =>
  S(k.extrude(gearRing(cx, cy, rRoot, rTip, teeth, 0), z, h, P, { convex: false, bevel: 0 }), { tone });
const annulus = (cx, cy, rIn, rOut, z, h, tone = "hi") =>
  S(k.extrude(annulusRing(cx, cy, rIn, rOut), z, h, P, { convex: false, bevel: 0.5 }), { tone });

function jewel(cx, cy, z, r = 1.7) {
  const c = at([cx, cy, z]);
  return `<circle class="iso-jewel" cx="${c[0].toFixed(2)}" cy="${c[1].toFixed(2)}" r="${r}"/>`;
}
function flatSpiral(cx, cy, rIn, rOut, turns, z, tone = "lo") {
  const N = 160;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = rIn + (rOut - rIn) * t;
    const a = 2 * Math.PI * turns * t;
    pts.push(polar(cx, cy, r, a));
  }
  return L(onTop(pts, z), { tone, className: "iso-hair" });
}

// ===== Static structure =====
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, PLATE_BOTTOM, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 26))) {
    out.push(S(k.cylinder(x, y, 8, PLATE_BOTTOM, 1.8, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, PLATE_BOTTOM + 1.8, 3.2, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, 0, PLATE_H, P, 10, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 14);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(k.dotsSvg(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // engraved spec label (the one allowed label)
  out.push(k.faceTextSvg(k.topMatrix([-58, 122], 0, P, "x"), "28 800 A/h", { size: 3.4, tone: "lo" }));
  return out.join("");
}

// ===== A wheel (static disc + hub + jewel) wrapped in a focus group =====
function wheelGroup(spec, group, extraStatic = "") {
  const { x: cx, y: cy } = spec;
  const disc = gearSolid(cx, cy, spec.rRoot, spec.rTip, spec.teeth, WHEEL_Z, WHEEL_H, spec.tone || "mid");
  const hub = S(k.cylinder(cx, cy, 5, WHEEL_Z, WHEEL_H + 0.4, P, 24), { tone: "mid" });
  const ringLine = L(topRing(cx, cy, spec.rRoot - 1.5, WHEEL_TOP + 0.3), { tone: "faint" });
  const j = jewel(cx, cy, WHEEL_TOP + 0.4, 1.6);
  return `<g data-group="${group}">${disc}${hub}${ringLine}${extraStatic}${j}<g class="iso-rot" data-part="rot-${spec.id}"></g></g>`;
}

// ===== Barrel with visible mainspring coil =====
function barrelGroup() {
  const coil = flatSpiral(B.x, B.y, 7, B.rRoot - 4, 8, WHEEL_TOP + 0.4, "lo");
  return wheelGroup(B, "power train", coil);
}

// ===== Chapter ring (open dial) at HUB + hour markers =====
function chapterRing() {
  const out = [];
  out.push(annulus(HUB[0], HUB[1], C.rTip + 3, C.rTip + 13, CHAPTER_Z, 1.4, "hi"));
  const ticks = k.radialTicks(HUB[0], HUB[1], C.rTip + 11, 60, 5, CHAPTER_Z + 1.4, [2, 4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "hi" }));
  out.push(L(topRing(HUB[0], HUB[1], C.rTip + 13, CHAPTER_Z + 1.4, 64), { tone: "lo" }));
  out.push(L(topRing(HUB[0], HUB[1], C.rTip + 3, CHAPTER_Z + 1.4, 64), { tone: "lo" }));
  return `<g data-group="struct display">${out.join("")}</g>`;
}

// ===== Second sub-dial at F =====
function secondDial() {
  const out = [];
  out.push(annulus(F.x, F.y, F.rTip + 2, F.rTip + 9, CHAPTER_Z, 1.2, "hi"));
  const ticks = k.radialTicks(F.x, F.y, F.rTip + 7, 12, 1, CHAPTER_Z + 1.2, [1.6, 3], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "hi" }));
  return `<g data-group="struct display">${out.join("")}</g>`;
}

// ===== Bridges (slender, leave wheels visible) =====
function bridges() {
  const out = [];
  // barrel bridge: arm from plate edge to barrel
  out.push(bar([-128, -62], [B.x, B.y], 13, BRIDGE_Z, BRIDGE_H, "mid"));
  out.push(jewel(B.x, B.y, BRIDGE_TOP, 1.5));
  // train bridge: arms linking C-T-F
  out.push(bar([C.x, C.y], [T.x, T.y], 12, BRIDGE_Z, BRIDGE_H, "mid"));
  out.push(bar([T.x, T.y], [F.x, F.y], 12, BRIDGE_Z, BRIDGE_H, "mid"));
  out.push(jewel(T.x, T.y, BRIDGE_TOP, 1.4));
  out.push(jewel(F.x, F.y, BRIDGE_TOP, 1.4));
  out.push(jewel(C.x, C.y, BRIDGE_TOP, 1.4));
  // screws on bridge ends
  out.push(k.dotsSvg([at([-128, -62, BRIDGE_TOP]), at([C.x, C.y, BRIDGE_TOP]), at([F.x, F.y, BRIDGE_TOP])], { size: 0.5, tone: "mid" }));
  return `<g data-group="struct">${out.join("")}</g>`;
}

// ===== Balance wheel: open rim + hub (rotating parts handled live) =====
function balanceGroup() {
  const out = [];
  out.push(annulus(BAL.x, BAL.y, BAL.r - 5, BAL.r, BAL_Z, BAL_H, "hi")); // rim band
  out.push(L(topRing(BAL.x, BAL.y, BAL.r, BAL_TOP, 64), { tone: "hi" }));
  out.push(L(topRing(BAL.x, BAL.y, BAL.r - 5, BAL_TOP, 64), { tone: "mid" }));
  out.push(S(k.cylinder(BAL.x, BAL.y, 6, BAL_Z, BAL_H + 0.4, P, 24), { tone: "mid" })); // hub
  return `<g data-group="osc">${out.join("")}<g class="iso-rot" data-part="balance-rot"></g></g>`;
}

// ===== Balance cock (bridge over balance) =====
function balanceCock() {
  const out = [];
  out.push(bar([BAL.x, BAL.y], [BAL.x + 34, BAL.y - 30], 14, COCK_Z, COCK_H, "mid"));
  out.push(S(k.cylinder(BAL.x, BAL.y, 5, COCK_Z + COCK_H - 1, 3, P, 22), { tone: "mid" }));
  out.push(jewel(BAL.x, BAL.y, COCK_Z + COCK_H + 2, 1.4));
  out.push(L(k.knurl(BAL.x, BAL.y, 5, COCK_Z + COCK_H - 1, COCK_Z + COCK_H + 2, 18, P), { tone: "lo" }));
  // a regulating screw on the cock (ties to the regulator)
  out.push(S(k.cylinder(BAL.x + 30, BAL.y - 26, 3, COCK_Z, COCK_H + 3, P, 18), { tone: "hi" }));
  out.push(L(k.knurl(BAL.x + 30, BAL.y - 26, 3, COCK_Z, COCK_Z + COCK_H + 3, 14, P), { tone: "lo" }));
  return `<g data-group="struct osc">${out.join("")}</g>`;
}

// ===== Pallet fork (rotating, handled live) =====
function forkGroup() {
  return `<g data-group="escape"><g class="iso-rot" data-part="fork-rot"></g></g>`;
}

// ===== Crown + winding stem =====
function crownGroup() {
  const out = [];
  out.push(S(k.cylinder(CROWN[0], CROWN[1], 7, CROWN_Z, CROWN_H, P, 30), { tone: "mid" }));
  out.push(L(k.knurl(CROWN[0], CROWN[1], 7, CROWN_Z, CROWN_Z + CROWN_H, 36, P), { tone: "lo" }));
  out.push(L(k.sideArc(CROWN[0], CROWN[1], 7, CROWN_Z + CROWN_H, P, 30), { tone: "faint" }));
  out.push(S(k.cylinder(CROWN[0], CROWN[1], 2.4, CROWN_Z + CROWN_H, 2, P, 16), { tone: "hi" }));
  // winding drive from the crown back to the barrel arbor. Drawn as a dashed
  // lead rather than a solid bar, so it explains the energy path without
  // striking a bright strip across the whole plate.
  out.push(L(k.lineOnTop([CROWN[0] - 4, CROWN[1]], [B.x + B.rRoot, B.y], WHEEL_TOP + 1.2, P), { tone: "mid", dashed: true }));
  return `<g data-group="power">${out.join("")}</g>`;
}

// ===== Hands (rotating, handled live) =====
function handGroups() {
  return (
    `<g data-group="display"><g class="iso-rot" data-part="hand-hour"></g></g>` +
    `<g data-group="display"><g class="iso-rot" data-part="hand-minute"></g></g>` +
    `<g data-group="display"><g class="iso-rot" data-part="hand-second"></g></g>`
  );
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A skeletonised mechanical-watch movement. The mainspring barrel stores energy; the going train (centre, third, fourth, escape wheels) carries it and divides the motion; the pallet fork and escape wheel gate it one tooth per beat; the balance wheel and hairspring oscillate at a fixed 4 Hz and set the rate; the hands show the result.",
  body: [
    base(),
    barrelGroup(),
    wheelGroup(C, "train"),
    wheelGroup(T, "train"),
    wheelGroup(F, "train"),
    bridges(),
    chapterRing(),
    secondDial(),
    wheelGroup(E, "escape train"),
    forkGroup(),
    balanceGroup(),
    balanceCock(),
    crownGroup(),
    handGroups(),
  ],
});

const wheelsForConfig = [B, C, T, F, E].map((s) => ({
  id: s.id, cx: s.x, cy: s.y, rRoot: s.rRoot, rTip: s.rTip, teeth: s.teeth,
  spokes: s.spokes, omega: s.omega, dir: s.dir, stepped: !!s.stepped,
}));

const CONFIG = {
  P,
  FREQ, BPH, BEATS, ESC_TEETH,
  HUB, F, BAL, PF,
  WHEEL_TOP, BAL_TOP, HAND_Z,
  Z_SPIRAL: BAL_TOP - 1,
  wheels: wheelsForConfig,
  desc: {
    all: "机械表靠一个高频振荡器（摆轮+游丝）定速，擒纵机构每次摆动只放行一格轮齿，轮系再把这份均匀的运动分频后驱动指针。拖动速度、点击各子系统、用空格播放/暂停。",
    power: "动力 · 表冠上链把能量储存在发条盒的主发条里，发条缓缓释放扭矩，是整枚机芯的能量来源。注意：动力储备耗尽后，表会停走——试试“上链”。",
    train: "轮系 · 发条盒→中心轮→三轮→四轮→擒纵轮。轮系一边传力一边逐级减速：四轮每分钟一圈（秒针），中心轮每小时一圈（分针）。转动的快慢差异正是减速比。",
    escape: "擒纵 · 摆轮每摆动一次，擒纵叉解锁，让擒纵轮前进一个齿再锁住。这种“一次放一格”的闸门把连续转动切成等时的滴答，并反过来给摆轮补一份冲量。",
    osc: "振荡器（心脏）· 摆轮在游丝作用下以固定频率来回摆动，是整只表的时间基准。频率由游丝长度与摆轮惯量决定，调节它即“校时”。试试下方的调节律滑块。",
    display: "显示 · 被均匀“放行”的运动经轮系分频后驱动指针：秒、分、时针按 60:1 的节奏转动，把振荡器的等时性翻译成你能读出的时间。",
  },
};

const live = readFileSync(join(HERE, "live.js"), "utf8");

const stage = `<div class="iso-stage" tabindex="0" role="application" aria-label="机械表机芯计时原理交互演示" data-focus="all">${svg}</div>`;

const controls = `
<section class="mw-controls" aria-label="控制面板">
  <div class="mw-row mw-focus">
    <span class="mw-lab">子系统</span>
    <div class="mw-btns" role="group">
      <button data-focus-btn="all" class="on">全部</button>
      <button data-focus-btn="power">动力</button>
      <button data-focus-btn="train">轮系</button>
      <button data-focus-btn="escape">擒纵</button>
      <button data-focus-btn="osc">振荡器</button>
      <button data-focus-btn="display">显示</button>
    </div>
  </div>
  <div class="mw-row">
    <span class="mw-lab">播放</span>
    <button id="mw-play" class="mw-play">⏸ 暂停</button>
    <button id="mw-wind" class="mw-wind">⚙ 上链 +60%</button>
    <span class="mw-gauge" title="动力储备"><span class="mw-gauge-fill" id="mw-power"></span></span>
    <span class="mw-num" id="mw-power-num">100%</span>
  </div>
  <div class="mw-row">
    <span class="mw-lab">速度</span>
    <input id="mw-speed" type="range" min="0.03" max="2" step="0.01" value="0.4">
    <span class="mw-num" id="mw-speed-num">0.40×</span>
  </div>
  <div class="mw-row">
    <span class="mw-lab">调节律</span>
    <input id="mw-reg" type="range" min="-0.12" max="0.12" step="0.001" value="0">
    <span class="mw-num" id="mw-reg-num">日差 0 s</span>
  </div>
  <p class="mw-desc" id="mw-desc">${CONFIG.desc.all}</p>
</section>
`;

const style = `
<style>
.mw-controls{margin:22px 2px 0;color:var(--anatomy-text);font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.mw-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:10px 0}
.mw-lab{color:var(--anatomy-muted);min-width:48px;letter-spacing:.08em;font-size:12px}
.mw-btns{display:flex;gap:6px;flex-wrap:wrap}
.mw-btns button,.mw-play,.mw-wind{cursor:pointer;border:1px solid var(--anatomy-mid);background:transparent;color:var(--anatomy-strong);padding:6px 12px;border-radius:7px;font:12px/1 ui-sans-serif,system-ui;letter-spacing:.04em;transition:.2s}
.mw-btns button:hover,.mw-play:hover,.mw-wind:hover{border-color:var(--anatomy-hi)}
.mw-btns button.on{background:var(--anatomy-hi);color:var(--anatomy-card);border-color:var(--anatomy-hi)}
.mw-num{color:var(--anatomy-strong);font-family:var(--anatomy-mono);font-variant-numeric:tabular-nums;min-width:84px}
.mw-gauge{flex:1;min-width:120px;height:8px;border-radius:5px;background:var(--anatomy-shade-1);border:1px solid var(--anatomy-mid);overflow:hidden;max-width:220px}
.mw-gauge-fill{display:block;height:100%;width:100%;background:linear-gradient(90deg,var(--anatomy-green),var(--anatomy-hi));transition:width .3s}
.mw-desc{margin:14px 0 0;padding:14px 16px;border-left:2px solid var(--anatomy-hi);background:var(--anatomy-card);color:var(--anatomy-text);border-radius:0 8px 8px 0;min-height:42px}
input[type=range]{accent-color:var(--anatomy-hi);flex:1;max-width:320px}
.iso-jewel{fill:var(--anatomy-red);stroke:var(--anatomy-hi);stroke-width:.4}
.iso-dot-hi{fill:var(--anatomy-hi)}
.iso-screw{fill:var(--anatomy-mid);stroke:var(--anatomy-hi);stroke-width:.4}
.iso-hub{fill:var(--anatomy-mid);stroke:var(--anatomy-hi);stroke-width:.4}
.iso-hair{stroke-width:.9}
.iso-fork{stroke-width:2.2}
/* Focus dimming in three tiers. Every selector has the same specificity,
   so source order decides: dim all groups, lift the scaffold, then light up
   the selected subsystem (and, for escapement, its balance partner). */
.iso-stage[data-focus="power"] [data-group],
.iso-stage[data-focus="train"] [data-group],
.iso-stage[data-focus="escape"] [data-group],
.iso-stage[data-focus="osc"] [data-group],
.iso-stage[data-focus="display"] [data-group]{opacity:.12}
.iso-stage[data-focus="power"] [data-group~="struct"],
.iso-stage[data-focus="train"] [data-group~="struct"],
.iso-stage[data-focus="escape"] [data-group~="struct"],
.iso-stage[data-focus="osc"] [data-group~="struct"],
.iso-stage[data-focus="display"] [data-group~="struct"]{opacity:.26}
.iso-stage[data-focus="power"] [data-group~="power"],
.iso-stage[data-focus="train"] [data-group~="train"],
.iso-stage[data-focus="escape"] [data-group~="escape"],
.iso-stage[data-focus="escape"] [data-group~="osc"],
.iso-stage[data-focus="osc"] [data-group~="osc"],
.iso-stage[data-focus="display"] [data-group~="display"]{opacity:1}
/* the balance drives the escapement, but in escapement view it is the
   partner rather than the protagonist */
.iso-stage[data-focus="escape"] [data-group~="osc"]{opacity:.6}
.iso-stage [data-group]{transition:opacity .45s cubic-bezier(.32,.72,0,1)}
@media (prefers-reduced-motion:reduce){.iso-stage [data-group]{transition:none}}
/* keep the small Chinese annotations legible against the dark plate */
.iso-plate-corner[data-corner="hint"]{color:var(--anatomy-text)}
.iso-legend,.iso-key,.iso-caption{color:var(--anatomy-text)}
.mw-beat{display:inline-block;color:var(--anatomy-red);font-size:9px;margin-right:5px;vertical-align:1px}
</style>`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "机械表机芯 · 计时原理",
  hint: "拖动速度 · 点击子系统 · 空格播放/暂停",
  readout: "28 800 A/h · 4.0 Hz",
  keys: [
    { mark: "lit", label: "游丝 / 摆轮：时间基准（4 Hz 振荡）" },
    { mark: "raised", label: "轮齿与指针：被均匀放行的运动" },
    { mark: "dim", label: "红宝石轴承：各轮的枢轴" },
  ],
  caption:
    "一枚透盖式机械机芯。发条盒储能；轮系（中心轮·三轮·四轮·擒纵轮）传力并分频；擒纵叉与擒纵轮“一次放一格”地把连续转动切成等时的滴答；摆轮+游丝以固定 4 Hz 振荡设定走时快慢；指针把这一切翻译成时间。",
  body: stage,
}) + controls + style;

writeFileSync(join(HERE, theme === "light" ? "mechanical-watch-light.html" : "mechanical-watch.html"), k.pageHtml({ title: "机械表机芯 · 计时原理", theme, width: 760, body, script: kitScript() + "\nconst CONFIG = " + JSON.stringify(CONFIG) + ";\n" + live }));
console.log("wrote", theme === "light" ? "mechanical-watch-light.html" : "mechanical-watch.html");
