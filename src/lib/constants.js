// ══════════════════════════════════════════
// Resona — Shared constants and utilities
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

// Large pools — 5 random items are picked each time the picker opens
export var WHISPER_POOL = [
  "here", "closer", "stay", "again", "you",
  "always", "soon", "miss", "near", "yours",
  "safe", "home", "warm", "still", "now",
  "listen", "softly", "gentle", "tender", "waiting",
  "tonight", "dream", "found", "hold", "breathe",
];
export var ECHO_POOL = [
  { g: "\u2661", n: "tenderness" },
  { g: "\u221E", n: "always" },
  { g: "\u263E", n: "tonight" },
  { g: "\u2740", n: "bloom" },
  { g: "\u2727", n: "light" },
  { g: "\u2022", n: "moment" },
  { g: "\u2042", n: "constellation" },
  { g: "\u2726", n: "spark" },
  { g: "\u223F", n: "wave" },
  { g: "\u25CB", n: "whole" },
  { g: "\u2020", n: "anchor" },
  { g: "\u2605", n: "wish" },
  { g: "\u2302", n: "home" },
  { g: "\u2766", n: "devotion" },
  { g: "\u2756", n: "precious" },
];
export var GLIMPSE_TEXTS = [
  "a fragment of what you\u2019re building",
  "your shared canvas grows",
  "traces accumulate silently",
  "something is taking shape",
  "look what you\u2019re creating",
  "every trace leaves a mark",
];
export var FONT = "'Outfit', sans-serif";

// Pick n random unique items from an array
export function pickN(arr, n) {
  var copy = arr.slice();
  var result = [];
  for (var i = 0; i < Math.min(n, copy.length); i++) {
    var idx = Math.floor(Math.random() * copy.length);
    result.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return result;
}

// ── Cooldown constants ──
// Minimum hours between resonance moments for the same pair
export var MOMENT_COOLDOWN_HOURS = 5;
// Minimum hours between still-here gestures
export var STILL_HERE_COOLDOWN_HOURS = 4;
// Hours before nudge becomes available
export var NUDGE_DELAY_HOURS = 2;
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

// ── Epoch progression ──
export var EPOCH_THRESHOLDS = [
  { traces: 0,   hueShift: 0,    satBoost: 0 },
  { traces: 10,  hueShift: 0.02, satBoost: 0.01 },
  { traces: 25,  hueShift: 0.05, satBoost: 0.02 },
  { traces: 50,  hueShift: 0.09, satBoost: 0.03 },
  { traces: 100, hueShift: 0.14, satBoost: 0.04 },
];

export var MILESTONES = [
  { traces: 1,   text: "the first mark" },
  { traces: 10,  text: "ten traces between you" },
  { traces: 25,  text: "something is growing" },
  { traces: 50,  text: "half a hundred moments" },
  { traces: 100, text: "a hundred traces deep" },
];

// ── Tone-based discovery parameters (radii sized for finger touch) ──
export var TONE_DISCOVERY = {
  nearness:    { baseRadius: 0.15, preferSignal: "drift" },
  warmth:      { baseRadius: 0.13, preferSignal: null },
  playfulness: { baseRadius: 0.12, preferSignal: "shimmer", driftSpeed: 0.15 },
  longing:     { baseRadius: 0.10, preferSignal: "pulse" },
  tension:     { baseRadius: 0.08, preferSignal: "flicker" },
};

// ── Residue echo config ──
export var RESIDUE_CONFIG = [
  { maxAge: 1800000, baseAlpha: 0.06 },   // newest: 30 min
  { maxAge: 3600000, baseAlpha: 0.04 },   // second: 60 min
  { maxAge: 7200000, baseAlpha: 0.025 },  // third: 120 min
];
export var MAX_ECHOES = 3;

// ── Epoch interpolation helper ──
export function getEpochShift(traceCount) {
  var th = EPOCH_THRESHOLDS;
  for (var i = th.length - 1; i >= 0; i--) {
    if (traceCount >= th[i].traces) {
      if (i === th.length - 1) return { hueShift: th[i].hueShift, satBoost: th[i].satBoost };
      var next = th[i + 1];
      var progress = (traceCount - th[i].traces) / (next.traces - th[i].traces);
      return {
        hueShift: lerp(th[i].hueShift, next.hueShift, progress),
        satBoost: lerp(th[i].satBoost, next.satBoost, progress),
      };
    }
  }
  return { hueShift: 0, satBoost: 0 };
}

// ── Enhanced artwork rendering ──
export function drawArtwork(ctx, contribs, w, h, alpha) {
  if (!contribs || contribs.length === 0) return;
  var total = contribs.length;

  // 1. Subtle noise background tinted by average tone color
  var avgR = 0, avgG = 0, avgB = 0, toneCount = 0;
  contribs.forEach(function(ct) {
    var tn = TONES[ct.tone];
    if (tn) { avgR += tn.rgb[0]; avgG += tn.rgb[1]; avgB += tn.rgb[2]; toneCount++; }
  });
  if (toneCount > 0) { avgR /= toneCount; avgG /= toneCount; avgB /= toneCount; }
  // Paint a very subtle color wash
  var washAlpha = Math.min(0.04, 0.02 + total * 0.001) * alpha;
  ctx.globalAlpha = washAlpha;
  ctx.globalCompositeOperation = "screen";
  var cx = w / 2, cy = h / 2, maxDim = Math.max(w, h);
  var wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDim * 0.6);
  wash.addColorStop(0, "rgb(" + Math.round(avgR) + "," + Math.round(avgG) + "," + Math.round(avgB) + ")");
  wash.addColorStop(1, "transparent");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  // 2. Draw traces with temporal layering and composition offset
  contribs.forEach(function(ct, i) {
    if (!ct.path || ct.path.length < 2) return;
    var tn = TONES[ct.tone];
    if (!tn) return;

    // Temporal layering: older = more diffuse, lower opacity; newer = sharper
    var age = i / Math.max(1, total - 1); // 0 = oldest, 1 = newest
    var layerAlpha = (0.25 + age * 0.5) * alpha;
    var glowW = 16 - age * 10; // older = wider glow, newer = tighter

    // Composition offset: slight rotation and translation per trace
    var offX = Math.sin(i * 1.7) * 0.025;
    var offY = Math.cos(i * 2.3) * 0.025;
    var rot = Math.sin(i * 0.8) * 0.04;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rot);
    ctx.translate(-w / 2 + offX * w, -h / 2 + offY * h);

    // Outer glow
    ctx.globalAlpha = Math.min(0.6, layerAlpha * 0.6);
    ctx.globalCompositeOperation = "screen";
    ctx.beginPath();
    ctx.strokeStyle = tn.colors[1] + (glowW > 5 ? "44" : "22");
    ctx.lineWidth = glowW;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ct.path.forEach(function(pt, j) { j === 0 ? ctx.moveTo(pt.x * w, pt.y * h) : ctx.lineTo(pt.x * w, pt.y * h); });
    ctx.stroke();

    // Core line
    ctx.beginPath();
    ctx.strokeStyle = tn.colors[0];
    ctx.globalAlpha = Math.min(0.7, layerAlpha);
    ctx.lineWidth = Math.max(1, glowW / 4);
    ct.path.forEach(function(pt, j) { j === 0 ? ctx.moveTo(pt.x * w, pt.y * h) : ctx.lineTo(pt.x * w, pt.y * h); });
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  });
}

// ── Gesture Feel Analysis ──
// Analyzes HOW a gesture was drawn, not what it looks like
export function analyzeGestureFeel(path) {
  if (!path || path.length < 3) return { speed: 0.5, complexity: 0.3, intensity: 0.3, duration: 0 };
  var dur = path[path.length - 1].t - path[0].t;
  var totalDist = 0, dirChanges = 0;
  for (var i = 1; i < path.length; i++) {
    var dx = path[i].x - path[i-1].x, dy = path[i].y - path[i-1].y;
    totalDist += Math.sqrt(dx * dx + dy * dy);
    if (i > 1) {
      var pdx = path[i-1].x - path[i-2].x, pdy = path[i-1].y - path[i-2].y;
      if (Math.abs(pdx * dy - pdy * dx) > 0.00005) dirChanges++;
    }
  }
  var avgSpeed = dur > 0 ? totalDist / (dur / 1000) : 0.5;
  var speed = clamp(avgSpeed / 1.2, 0, 1);
  var complexity = clamp(dirChanges / 15, 0, 1);
  var intensity = clamp(speed * 0.5 + complexity * 0.5, 0, 1);
  return { speed: speed, complexity: complexity, intensity: intensity, duration: dur };
}

// ── Discovery Modifier from gesture feel ──
export function getDiscoveryMod(gestureData) {
  var feel = gestureData && gestureData.feel ? gestureData.feel : null;
  if (!feel && gestureData && gestureData.path) {
    feel = analyzeGestureFeel(gestureData.path);
  }
  if (!feel) return { noiseSpeed: 1, particleSpeed: 1, particleDamping: 0.9, signalAlpha: 1, glowRadius: 1 };

  var s = feel.speed, c = feel.complexity;

  if (s < 0.3 && c < 0.3) {
    return { noiseSpeed: 0.5, particleSpeed: 0.5, particleDamping: 0.95, signalAlpha: 0.7, glowRadius: 0.9 };
  } else if (s < 0.3 && c > 0.5) {
    return { noiseSpeed: 0.7, particleSpeed: 0.7, particleDamping: 0.93, signalAlpha: 0.9, glowRadius: 1.3 };
  } else if (s > 0.6 && c < 0.3) {
    return { noiseSpeed: 1.5, particleSpeed: 1.8, particleDamping: 0.85, signalAlpha: 1.2, glowRadius: 1.0 };
  } else if (s > 0.6 && c > 0.5) {
    return { noiseSpeed: 1.4, particleSpeed: 2.0, particleDamping: 0.83, signalAlpha: 1.3, glowRadius: 1.2 };
  }
  return { noiseSpeed: 1, particleSpeed: 1, particleDamping: 0.9, signalAlpha: 1, glowRadius: 1 };
}

// ── Artwork Bleed Config ──
export var ARTWORK_BLEED_PHASES = [
  { min: 5,  max: 14, count: 1, alpha: 0.02, cycleMs: 10000, fadeMs: 2000 },
  { min: 15, max: 29, count: 3, alpha: 0.03, cycleMs: 0, fadeMs: 0 },
  { min: 30, max: 49, count: 5, alpha: 0.035, cycleMs: 0, fadeMs: 0 },
  { min: 50, max: 9999, count: 7, alpha: 0.04, cycleMs: 0, fadeMs: 0 },
];

export function getBleedPhase(traceCount) {
  for (var i = 0; i < ARTWORK_BLEED_PHASES.length; i++) {
    if (traceCount >= ARTWORK_BLEED_PHASES[i].min && traceCount <= ARTWORK_BLEED_PHASES[i].max) {
      return ARTWORK_BLEED_PHASES[i];
    }
  }
  return null;
}

// ── Turn Reminder ──
export var TURN_REMINDER_DELAY_HOURS = 3;

// ── Idle Touch Ripple Config ──
export var RIPPLE_MAX_AGE_MS = 3000;
export var RIPPLE_MAX_POINTS = 60;

// ── Discovery Mode Config ──
export var WAKE_BREATH_CYCLE_MS = 5500;
export var WAKE_THRESHOLD = 0.72;
export var FOLLOW_DURATION_MS = 3500;

// ── Discovery Mode Assignment ──
// Computed at send time from tone + gesture feel.
// First trace always gets 'stillness' to ensure an intuitive onboarding moment.
export function computeDiscoveryMode(tone, feel, isFirstTrace) {
  if (isFirstTrace) return 'stillness';
  if (!feel) return 'stillness';

  if (tone === 'playfulness') return 'follow';

  if (tone === 'longing' || tone === 'tension') {
    if (feel.duration > 1500 || feel.intensity > 0.35) return 'wake';
  }

  if (feel.speed > 0.5 && feel.complexity > 0.3 && tone !== 'nearness' && tone !== 'warmth') {
    return 'follow';
  }

  return 'stillness';
}
