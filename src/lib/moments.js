// ══════════════════════════════════════════
// Resona Moment Detection
// — Cooldown between moments (configurable, default 5h)
// — Priority: twin_connection > trace_convergence > amplified_reveal
// — Only ONE moment per reveal (the highest-priority match)
// — Events are written to DB so the partner receives them
// ══════════════════════════════════════════

import { getRecentTraces, getLastResonanceEvent, createResonanceEvent } from './supabase.js';
import { MOMENT_COOLDOWN_HOURS, MOMENT_PRIORITY, analyzeGesture } from './constants.js';

// ── Twin Connection ──
// Both users must have sent within the last 15 MINUTES
async function checkTwinConnection(pairId, justSentUserId, tone) {
  var traces = await getRecentTraces(pairId, 15 / 60); // last 15 minutes
  if (traces.length < 2) return null;

  var senders = new Set(traces.map(function(t) { return t.sender_id; }));
  if (senders.size < 2) return null;

  var traceIds = traces.slice(0, 2).map(function(t) { return t.id; });
  return {
    type: 'twin_connection',
    tone: tone,
    triggerTraces: traceIds,
  };
}

// ── Amplified Reveal ──
// Now automatic — no picker needed. Triggers on intense gestures.
function checkAmplifiedReveal(trace) {
  if (!trace || !trace.gesture_data || !trace.gesture_data.path) return null;
  var analysis = analyzeGesture(trace.gesture_data.path);

  if (analysis.duration > 3000 && analysis.dirChanges > 8 && analysis.intensity > 0.65) {
    return {
      type: 'amplified_reveal',
      tone: trace.emotional_tone,
      triggerTraces: [trace.id],
      automatic: true,
    };
  }
  return null;
}

// ── Trace Convergence ──
async function checkTraceConvergence(pairId, justDiscoveredTrace) {
  var traces = await getRecentTraces(pairId, 24);
  if (traces.length < 2) return null;

  var other = traces.find(function(t) {
    return t.sender_id !== justDiscoveredTrace.sender_id && t.gesture_data && t.gesture_data.path;
  });
  if (!other) return null;

  var pathA = justDiscoveredTrace.gesture_data.path;
  var pathB = other.gesture_data.path;
  if (!pathA || !pathB || pathA.length < 3 || pathB.length < 3) return null;

  var overlapRadius = 0.12;
  var overlapCount = 0;
  pathA.forEach(function(ptA) {
    for (var i = 0; i < pathB.length; i++) {
      var d = Math.sqrt((ptA.x - pathB[i].x) ** 2 + (ptA.y - pathB[i].y) ** 2);
      if (d < overlapRadius) { overlapCount++; break; }
    }
  });

  var overlapRatio = overlapCount / pathA.length;
  if (overlapRatio < 0.45) return null;

  return {
    type: 'trace_convergence',
    tone: justDiscoveredTrace.emotional_tone,
    triggerTraces: [justDiscoveredTrace.id, other.id],
  };
}

// ── Main detection ──
export async function detectMoment(pairId, userId, justDiscoveredTrace, tone) {
  try {
    var lastEvent = await getLastResonanceEvent(pairId);
    if (lastEvent) {
      var hoursSince = (Date.now() - new Date(lastEvent.triggered_at).getTime()) / 3600000;
      if (hoursSince < MOMENT_COOLDOWN_HOURS) {
        return null;
      }
    }
  } catch (e) {
    console.warn("Moment cooldown check failed:", e);
    return null;
  }

  var candidates = [];

  var twin = await checkTwinConnection(pairId, userId, tone);
  if (twin) candidates.push(twin);

  var amp = checkAmplifiedReveal(justDiscoveredTrace);
  if (amp) candidates.push(amp);

  var conv = await checkTraceConvergence(pairId, justDiscoveredTrace);
  if (conv) candidates.push(conv);

  if (candidates.length === 0) return null;

  candidates.sort(function(a, b) {
    return (MOMENT_PRIORITY[b.type] || 0) - (MOMENT_PRIORITY[a.type] || 0);
  });

  return candidates[0];
}

// ── Persist a moment to the DB ──
export async function persistMoment(pairId, moment, extraData) {
  try {
    return await createResonanceEvent(
      pairId,
      moment.type,
      moment.tone,
      moment.triggerTraces,
      extraData
    );
  } catch (e) {
    console.error("Failed to persist resonance event:", e);
    return null;
  }
}
