// ══════════════════════════════════════════
// Sound Design — Web Audio API
// Minimal, warm, atmospheric. Only at meaningful moments.
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
  note(392, 0.5, 0.09, 'sine');
  setTimeout(function() { note(494, 0.6, 0.07, 'sine'); }, 200);
}

// ── Reveal: C major arpeggio ──
export function soundReveal() {
  note(262, 1.0, 0.08, 'sine');
  setTimeout(function() { note(330, 0.9, 0.07, 'sine'); }, 300);
  setTimeout(function() { note(392, 1.2, 0.06, 'sine'); }, 600);
}

// ── Moment: warm bell ──
export function soundMoment() {
  note(523, 1.0, 0.07, 'triangle');
  note(786, 1.2, 0.035, 'sine');
}

// ── Trace sent: confirmation ──
export function soundSend() {
  note(440, 0.3, 0.07, 'sine');
  setTimeout(function() { note(523, 0.4, 0.06, 'sine'); }, 120);
}

// ── New trace arrived ──
export function soundIncoming() {
  note(392, 0.5, 0.08, 'sine');
  setTimeout(function() { note(494, 0.6, 0.06, 'triangle'); }, 250);
}

// ── Artwork reveal: deep, resonant ──
export function soundArtworkReveal() {
  note(131, 2.5, 0.10, 'sine');
  setTimeout(function() { note(196, 2.0, 0.08, 'sine'); }, 800);
  setTimeout(function() { note(262, 2.5, 0.07, 'triangle'); }, 1600);
}

export function initAudio() { getCtx(); }
