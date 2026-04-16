-- ══════════════════════════════════════════
-- RESONA — Migration 2: Still-here + Nudge + Turn-based fix
-- Run ONCE after supabase-migration.sql.
-- Safe to re-run.
-- ══════════════════════════════════════════

-- Extend resonance_events to support new event types
ALTER TABLE public.resonance_events 
  DROP CONSTRAINT IF EXISTS resonance_events_type_check;
ALTER TABLE public.resonance_events 
  ADD CONSTRAINT resonance_events_type_check 
  CHECK (type IN (
    'twin_connection', 'trace_convergence', 'amplified_reveal',
    'still_here', 'nudge'
  ));

-- Drop existing function first (return type changed)
DROP FUNCTION IF EXISTS create_resonance_event(uuid, text, text, uuid[], jsonb);

-- Recreate with correct return type
CREATE OR REPLACE FUNCTION create_resonance_event(
  p_pair_id uuid, p_type text, p_tone text, 
  p_trigger_traces uuid[], p_extra_data jsonb
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pairs 
    WHERE id = p_pair_id AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  
  INSERT INTO public.resonance_events (pair_id, type, tone, trigger_traces, extra_data)
  VALUES (p_pair_id, p_type, p_tone, p_trigger_traces, p_extra_data)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════
-- Fix: Turn-based sending
-- After you send a trace, you must wait for your partner
-- to send one before you can send again.
-- ══════════════════════════════════════════

CREATE OR REPLACE FUNCTION can_send_trace(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_pair_id uuid;
  v_has_open boolean;
  v_daily_count int;
  v_last_sender uuid;
BEGIN
  -- Get pair_id
  SELECT pair_id INTO v_pair_id FROM public.users WHERE id = p_user_id;
  IF v_pair_id IS NULL THEN RETURN false; END IF;

  -- Check if user has an undiscovered outgoing trace
  SELECT EXISTS(
    SELECT 1 FROM public.traces t WHERE t.sender_id = p_user_id AND t.discovered_at IS NULL
  ) INTO v_has_open;
  IF v_has_open THEN RETURN false; END IF;

  -- Check daily limit
  SELECT count(*) FROM public.traces t
  WHERE t.sender_id = p_user_id AND t.created_at > now() - interval '24 hours'
  INTO v_daily_count;
  IF v_daily_count >= 5 THEN RETURN false; END IF;

  -- Turn-based: who sent the last trace in this pair?
  SELECT sender_id INTO v_last_sender
  FROM public.traces
  WHERE pair_id = v_pair_id
  ORDER BY created_at DESC LIMIT 1;

  -- If no traces yet, can send (first trace ever)
  IF v_last_sender IS NULL THEN RETURN true; END IF;

  -- If last trace was from partner, it is your turn
  IF v_last_sender != p_user_id THEN RETURN true; END IF;

  -- Last trace was from this user, must wait for partner
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
