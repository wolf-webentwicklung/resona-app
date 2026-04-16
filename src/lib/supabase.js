import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════
// SUPABASE CONFIG
// ═══════════════════════════════════════════
const SUPABASE_URL = 'https://zcnzjndsbstpaowxglbp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8FYvT9wWpycrjfMKehomOg_yzEzy1lF';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Auth: anonymous sign-in ──
export async function ensureUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;

  await supabase.from('users').upsert({ id: data.user.id });
  return data.user;
}

// ── Auth: check if user is anonymous (guest) ──
export function isGuest(user) {
  return user && user.is_anonymous === true;
}

// ── Auth: link email to anonymous account ──
export async function linkEmail(email) {
  const { data, error } = await supabase.auth.updateUser({ email: email });
  if (error) throw error;
  return data;
}

// ── Auth: sign in with email (magic link) ──
export async function signInWithEmail(email) {
  const { data, error } = await supabase.auth.signInWithOtp({ email: email });
  if (error) throw error;
  return data;
}

// ── Pair: create invite ──
export async function createPair() {
  const { data, error } = await supabase.rpc('create_pair');
  if (error) throw error;
  return data;
}

// ── Pair: join via code ──
export async function joinPair(code) {
  const { data, error } = await supabase.rpc('join_pair', { p_code: code });
  if (error) throw error;
  return data;
}

// ── Pair: get current pair info ──
export async function getPair(userId) {
  const { data } = await supabase
    .from('users')
    .select('pair_id')
    .eq('id', userId)
    .single();
  if (!data?.pair_id) return null;

  const { data: pair } = await supabase
    .from('pairs')
    .select('*')
    .eq('id', data.pair_id)
    .single();
  return pair;
}

// ── Pair: get partner ID ──
export function getPartnerId(pair, myId) {
  if (!pair) return null;
  return pair.user_a_id === myId ? pair.user_b_id : pair.user_a_id;
}

// ── Traces: check if can send ──
export async function canSendTrace(userId) {
  const { data } = await supabase.rpc('can_send_trace', { p_user_id: userId });
  return data;
}

// ── Traces: send a trace ──
export async function sendTrace(pairId, senderId, receiverId, path, tone) {
  const signals = ['shimmer','pulse','drift','flicker','density','wave'];
  const sig = signals[Math.floor(Math.random() * signals.length)];
  const pos = { x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.55 };
  const sr = 0.08 + (Math.random() - 0.5) * 0.06;
  const passive = Math.random() < 0.2;

  const { data, error } = await supabase.from('traces').insert({
    pair_id: pairId,
    sender_id: senderId,
    receiver_id: receiverId,
    gesture_data: { path },
    emotional_tone: tone,
    signal_type: sig,
    reveal_position: pos,
    search_radius: sr,
    passive_reveal: passive,
  }).select().single();

  if (error) throw error;

  await supabase.from('artwork_contributions').insert({
    pair_id: pairId,
    trace_id: data.id,
    sender_id: senderId,
    path_data: { path },
    tone: tone,
  });

  return data;
}

// ── Traces: get pending incoming trace ──
export async function getPendingTrace(userId) {
  const { data } = await supabase
    .from('traces')
    .select('*')
    .eq('receiver_id', userId)
    .is('discovered_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

// ── Traces: mark as discovered ──
export async function discoverTrace(traceId) {
  const { error } = await supabase
    .from('traces')
    .update({ discovered_at: new Date().toISOString() })
    .eq('id', traceId);
  if (error) throw error;
}

// ── Artwork: get all contributions for pair ──
export async function getArtwork(pairId) {
  const { data } = await supabase
    .from('artwork_contributions')
    .select('*')
    .eq('pair_id', pairId)
    .order('created_at', { ascending: true });
  return data || [];
}

// ── Traces: get recent traces for moment detection ──
export async function getRecentTraces(pairId, hours) {
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const { data } = await supabase
    .from('traces')
    .select('*')
    .eq('pair_id', pairId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  return data || [];
}

// ── Resonance Events: create (via secure RPC — K6 fix) ──
export async function createResonanceEvent(pairId, type, tone, triggerTraces, extraData) {
  const { data, error } = await supabase.rpc('create_resonance_event', {
    p_pair_id: pairId,
    p_type: type,
    p_tone: tone,
    p_trigger_traces: triggerTraces,
    p_extra_data: extraData || null,
  });
  if (error) throw error;
  return data;
}

// ── Resonance Events: get last event for pair (for cooldown check) ──
export async function getLastResonanceEvent(pairId) {
  const { data } = await supabase
    .from('resonance_events')
    .select('*')
    .eq('pair_id', pairId)
    .order('triggered_at', { ascending: false })
    .limit(1)
    .single();
  return data; // null if no events
}

// ── Resonance Events: get unseen events for a user ──
export async function getUnseenEvents(pairId, userId, pair) {
  const isA = pair.user_a_id === userId;
  const { data } = await supabase
    .from('resonance_events')
    .select('*')
    .eq('pair_id', pairId)
    .eq(isA ? 'seen_by_a' : 'seen_by_b', false)
    .order('triggered_at', { ascending: true });
  return data || [];
}

// ── Resonance Events: mark seen ──
export async function markEventSeen(eventId, userId, pair) {
  const isA = pair.user_a_id === userId;
  await supabase.from('resonance_events')
    .update(isA ? { seen_by_a: true } : { seen_by_b: true })
    .eq('id', eventId);
}

// ── Dissolve pair ──
export async function dissolvePair() {
  const { error } = await supabase.rpc('dissolve_pair');
  if (error) throw error;
}

// ── Realtime: subscribe to new traces for this user ──
export function subscribeToTraces(userId, callback) {
  return supabase
    .channel('traces-' + userId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'traces',
      filter: 'receiver_id=eq.' + userId,
    }, (payload) => {
      callback(payload.new);
    })
    .subscribe();
}

// ── Realtime: subscribe to pair changes (partner joining) ──
export function subscribeToPair(pairId, callback) {
  return supabase
    .channel('pair-' + pairId)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'pairs',
      filter: 'id=eq.' + pairId,
    }, (payload) => {
      callback(payload.new);
    })
    .subscribe();
}

// ── Realtime: subscribe to resonance events for pair ──
export function subscribeToEvents(pairId, callback) {
  return supabase
    .channel('events-' + pairId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'resonance_events',
      filter: 'pair_id=eq.' + pairId,
    }, (payload) => {
      callback(payload.new);
    })
    .subscribe();
}

// ══════════════════════════════════════
// PAIR PROPOSALS (Reunions + Artwork Resets)
// ══════════════════════════════════════

export async function getActiveProposal(pairId, type) {
  const { data } = await supabase
    .from('pair_proposals')
    .select('*')
    .eq('pair_id', pairId)
    .eq('type', type)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

export async function proposeReunion(pairId, userId, date) {
  await supabase.from('pair_proposals')
    .update({ status: 'declined' })
    .eq('pair_id', pairId).eq('type', 'reunion').eq('status', 'pending');
  const { data, error } = await supabase.from('pair_proposals').insert({
    pair_id: pairId, proposed_by: userId, type: 'reunion', proposed_date: date, status: 'pending',
  }).select().single();
  if (error) throw error;
  return data;
}

export async function proposeReset(pairId, userId) {
  await supabase.from('pair_proposals')
    .update({ status: 'declined' })
    .eq('pair_id', pairId).eq('type', 'reset').eq('status', 'pending');
  const { data, error } = await supabase.from('pair_proposals').insert({
    pair_id: pairId, proposed_by: userId, type: 'reset', status: 'pending',
  }).select().single();
  if (error) throw error;
  return data;
}

export async function proposeReveal(pairId, userId) {
  await supabase.from('pair_proposals')
    .update({ status: 'declined' })
    .eq('pair_id', pairId).eq('type', 'reveal').eq('status', 'pending');
  const { data, error } = await supabase.from('pair_proposals').insert({
    pair_id: pairId, proposed_by: userId, type: 'reveal', status: 'pending',
  }).select().single();
  if (error) throw error;
  return data;
}

export async function respondToProposal(proposalId, accept) {
  const { error } = await supabase.from('pair_proposals')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
    .eq('id', proposalId);
  if (error) throw error;
}

export async function completeProposal(proposalId) {
  await supabase.from('pair_proposals').update({ status: 'completed' }).eq('id', proposalId);
}

export async function executeResetArtwork(pairId) {
  const { error } = await supabase.rpc('reset_artwork', { p_pair_id: pairId });
  if (error) throw error;
}

export function subscribeToProposals(pairId, callback) {
  return supabase
    .channel('proposals-' + pairId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pair_proposals', filter: 'pair_id=eq.' + pairId },
      (payload) => { callback(payload.new, payload.eventType); })
    .subscribe();
}
