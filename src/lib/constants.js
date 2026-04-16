// ══════════════════════════════════════════
// Shared constants and utilities
// ══════════════════════════════════════════

export var TONES = {
  nearness:    { name: "Nearness",    colors: ["#D4A574","#E8C99B","#F2DFC1"], primary: "#D4A574", rgb: [212,165,116], ch: "slow" },
  longing:     { name: "Longing",     colors: ["#4A3198","#6B52C4","#8B7EC8"], primary: "#6B52C4", rgb: [107,82,196], ch: "stretch" },
  tension:     { name: "Tension",     colors: ["#C41E3A","#E03E5A","#FF6B7A"], primary: "#C41E3A", rgb: [196,30,58], ch: "sharp" },
  warmth:      { name: "Warmth",      colors: ["#E07A5F","#F2CC8F","#F4E4C1"], primary: "#E07A5F", rgb: [224,122,95], ch: "round" },
  playfulness: { name: "Playfulness", colors: ["#00B4D8","#48D1E8","#7EFCF6"], primary: "#00B4D8", rgb: [0,180,216], ch: "bounce" },
};

export var TONE_KEYS = Object.keys(TONES);
export var SIGNALS = ["shimmer","pulse","drift","flicker","density","wave"];
export var WHISPER_WORDS = ["here", "closer", "stay", "again", "you"];
export var ECHO_MARKS = [
  { g: "\u2661", n: "tenderness" },
  { g: "\u221E", n: "always" },
  { g: "\u263E", n: "tonight" },
  { g: "\u2740", n: "bloom" },
  { g: "\u2727", n: "light" },
];
export var GLIMPSE_TEXTS = [
  "a fragment of what you\u2019re building",
  "your shared canvas grows",
  "traces accumulate silently",
  "something is taking shape",
];
export var FONT = "'Outfit', sans-serif";

// ── Cooldown constants ──
// Minimum hours between resonance moments for the same pair
export var MOMENT_COOLDOWN_HOURS = 8;
// Priority order (higher = rarer, more important)
export var MOMENT_PRIORITY = {
  twin_connection: 3,
  trace_convergence: 2,
  amplified_reveal: 1,
};

export var lerp = function(a, b, t) { return a + (b - a) * t; };
export var dst = function(x1, y1, x2, y2) { return Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1)); };
export var clamp = function(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
export var pick = function(arr) { return arr[Math.floor(Math.random() * arr.length)]; };
export var hex2 = function(n) { return Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0"); };

export function makeNoise() {
  var p = [];
  for (var i = 0; i < 512; i++) p[i] = i & 255;
  for (var i2 = 255; i2 > 0; i2--) {
    var j = Math.floor(Math.random() * (i2 + 1));
    var t = p[i2]; p[i2] = p[j]; p[j] = t;
  }
  for (var i3 = 0; i3 < 256; i3++) p[i3 + 256] = p[i3];
  var fd = function(t2) { return t2*t2*t2*(t2*(t2*6-15)+10); };
  var gr = function(h, x, y) { return ((h&1)?-x:x) + ((h&2)?-y:y); };
  return function(x, y) {
    var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    var xf = x - Math.floor(x), yf = y - Math.floor(y);
    var u = fd(xf), v = fd(yf), a = p[X] + Y, b = p[X+1] + Y;
    return lerp(
      lerp(gr(p[a]&3, xf, yf), gr(p[b]&3, xf-1, yf), u),
      lerp(gr(p[a+1]&3, xf, yf-1), gr(p[b+1]&3, xf-1, yf-1), u), v
    );
  };
}

export function analyzeGesture(path) {
  if (!path || path.length < 2) return { duration: 0, avgSpeed: 0, dirChanges: 0, intensity: 0 };
  var dur = path[path.length-1].t - path[0].t;
  var totalDist = 0, dirChanges = 0;
  for (var i = 1; i < path.length; i++) {
    totalDist += dst(path[i-1].x, path[i-1].y, path[i].x, path[i].y);
    if (i > 1) {
      var dx1 = path[i-1].x - path[i-2].x, dy1 = path[i-1].y - path[i-2].y;
      var dx2 = path[i].x - path[i-1].x, dy2 = path[i].y - path[i-1].y;
      if (Math.abs(dx1*dy2 - dy1*dx2) > 0.0006) dirChanges++;
    }
  }
  var avgSpeed = dur > 0 ? totalDist / (dur / 1000) : 0;
  var intensity = clamp((dur/3000)*0.3 + (dirChanges/10)*0.4 + avgSpeed*0.3, 0, 1);
  return { duration: dur, avgSpeed: avgSpeed, dirChanges: dirChanges, intensity: intensity };
}

export function drawGesturePath(ctx, path, tone, w, h, alpha, glowWidth) {
  if (!path || path.length < 2) return;
  var tn = TONES[tone];
  if (!tn) return;
  ctx.globalAlpha = Math.min(0.7, alpha);
  ctx.globalCompositeOperation = "screen";
  ctx.beginPath();
  ctx.strokeStyle = tn.colors[1] + (glowWidth > 5 ? "44" : "22");
  ctx.lineWidth = glowWidth;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  path.forEach(function(pt, i) { i === 0 ? ctx.moveTo(pt.x*w, pt.y*h) : ctx.lineTo(pt.x*w, pt.y*h); });
  ctx.stroke();
  ctx.beginPath();
  ctx.strokeStyle = tn.colors[0];
  ctx.lineWidth = Math.max(1, glowWidth / 4);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  path.forEach(function(pt, i) { i === 0 ? ctx.moveTo(pt.x*w, pt.y*h) : ctx.lineTo(pt.x*w, pt.y*h); });
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
