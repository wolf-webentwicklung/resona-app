// ══════════════════════════════════════════
// Resona — Sound Design — Web Audio API
// Minimal, warm, atmospheric. Only at meaningful moments.
//
// Volume hierarchy (loudest → softest):
//   Artwork reveal / Shared canvas start  →  0.16-0.18
//   Moment bell / Incoming trace           →  0.14-0.15
//   Found / Reveal / Send                  →  0.12-0.14
//   Tone previews                          →  0.10-0.12
//   Still-here / Nudge                     →  0.08-0.09
// ══════════════════════════════════════════

var ctx = null;

function getCtx() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(function() {});
  return ctx;
}

function note(freq, dur, vol, type) {
  var c = getCtx(); if (!c) return;
  var osc = c.createOscillator();
  var gain = c.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, c.currentTime);
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(vol, c.currentTime + dur * 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(gain); gain.connect(c.destination);
  osc.start(c.currentTime); osc.stop(c.currentTime + dur + 0.1);
}

// ── Found the trace: two ascending notes ──
export function soundFound() {
  note(392, 0.5, 0.13, 'sine');
  setTimeout(function() { note(494, 0.6, 0.11, 'sine'); }, 200);
}

// ── Reveal: C major arpeggio ──
export function soundReveal() {
  note(262, 1.0, 0.14, 'sine');
  setTimeout(function() { note(330, 0.9, 0.12, 'sine'); }, 300);
  setTimeout(function() { note(392, 1.2, 0.10, 'sine'); }, 600);
}

// ── Moment: warm bell ──
export function soundMoment() {
  note(523, 1.0, 0.15, 'triangle');
  note(786, 1.2, 0.07, 'sine');
}

// ── Trace sent: confirmation ──
export function soundSend() {
  note(440, 0.3, 0.12, 'sine');
  setTimeout(function() { note(523, 0.4, 0.10, 'sine'); }, 120);
}

// ── New trace arrived: needs to get attention ──
export function soundIncoming() {
  note(392, 0.5, 0.14, 'sine');
  setTimeout(function() { note(494, 0.6, 0.12, 'triangle'); }, 250);
}

// ── Artwork reveal: deep, resonant — the biggest moment ──
export function soundArtworkReveal() {
  note(131, 2.5, 0.18, 'sine');
  setTimeout(function() { note(196, 2.0, 0.14, 'sine'); }, 800);
  setTimeout(function() { note(262, 2.5, 0.12, 'triangle'); }, 1600);
}

// ── Still-here presence: single soft tone ──
export function soundStillHere() {
  note(330, 0.8, 0.09, 'sine');
}

// ── Nudge sent: gentle double tap ──
export function soundNudge() {
  note(350, 0.25, 0.08, 'sine');
  setTimeout(function() { note(420, 0.3, 0.08, 'sine'); }, 180);
}

// ── Shared canvas session start: two harmonizing tones ──
export function soundSharedCanvas() {
  note(262, 1.0, 0.16, 'sine');
  note(392, 1.2, 0.10, 'sine');
  setTimeout(function() { note(330, 0.8, 0.10, 'triangle'); }, 400);
}

// ── Tone preview sounds: short characteristic preview per tone ──
export function soundTonePreview(toneName) {
  var c = getCtx(); if (!c) return;
  if (toneName === 'nearness') {
    note(220, 0.35, 0.10, 'sine');
  } else if (toneName === 'longing') {
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(350, c.currentTime);
    osc.frequency.linearRampToValueAtTime(320, c.currentTime + 0.4);
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(0.10, c.currentTime + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(c.currentTime); osc.stop(c.currentTime + 0.6);
  } else if (toneName === 'tension') {
    note(520, 0.15, 0.09, 'sawtooth');
  } else if (toneName === 'warmth') {
    note(280, 0.4, 0.10, 'triangle');
  } else if (toneName === 'playfulness') {
    note(440, 0.15, 0.10, 'sine');
    setTimeout(function() { note(660, 0.2, 0.10, 'sine'); }, 100);
  }
}

export function initAudio() { getCtx(); }
