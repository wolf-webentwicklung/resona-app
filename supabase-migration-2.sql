-- ══════════════════════════════════════════
-- RESONA — Migration 2
-- Fixes: type constraint, RLS recursion, turn-based, still-here/nudge
-- Run ONCE after supabase-migration.sql. Safe to re-run.
-- ══════════════════════════════════════════

-- ═══ 1. Fix resonance_events type constraint ═══
ALTER TABLE public.resonance_events 
  DROP CONSTRAINT IF EXISTS resonance_events_type_check;
ALTER TABLE public.resonance_events 
  ADD CONSTRAINT resonance_events_type_check 
  CHECK (type IN (
    'twin_connection', 'trace_convergence', 'amplified_reveal',
    'still_here', 'nudge'
  ));

-- ═══ 2. Fix pair_proposals type constraint (add 'reveal') ═══
ALTER TABLE public.pair_proposals 
  DROP CONSTRAINT IF EXISTS pair_proposals_type_check;
ALTER TABLE public.pair_proposals 
  ADD CONSTRAINT pair_proposals_type_check 
  CHECK (type IN ('reunion', 'reset', 'reveal'));

-- ═══ 3. Fix RLS recursion on pair_proposals ═══
-- Drop existing policies that cause infinite recursion
DROP POLICY IF EXISTS "proposals_select" ON public.pair_proposals;
DROP POLICY IF EXISTS "proposals_insert" ON public.pair_proposals;
DROP POLICY IF EXISTS "proposals_update" ON public.pair_proposals;
DROP POLICY IF EXISTS "proposals_delete" ON public.pair_proposals;

-- Recreate with simple auth check via users table (no nested pair lookup)
CREATE POLICY "proposals_select" ON public.pair_proposals FOR SELECT USING (
  pair_id = (SELECT pair_id FROM public.users WHERE id = auth.uid())
);
CREATE POLICY "proposals_insert" ON public.pair_proposals FOR INSERT WITH CHECK (
  pair_id = (SELECT pair_id FROM public.users WHERE id = auth.uid())
);
CREATE POLICY "proposals_update" ON public.pair_proposals FOR UPDATE USING (
  pair_id = (SELECT pair_id FROM public.users WHERE id = auth.uid())
);
CREATE POLICY "proposals_delete" ON public.pair_proposals FOR DELETE USING (
  pair_id = (SELECT pair_id FROM public.users WHERE id = auth.uid())
);

-- ═══ 4. Secure RPC for creating resonance events ═══
DROP FUNCTION IF EXISTS create_resonance_event(uuid, text, text, uuid[], jsonb);

CREATE OR REPLACE FUNCTION create_resonance_event(
  p_pair_id uuid, p_type text, p_tone text, 
  p_trigger_traces uuid[], p_extra_data jsonb
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND pair_id = p_pair_id
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  
  INSERT INTO public.resonance_events (pair_id, type, tone, trigger_traces, extra_data)
  VALUES (p_pair_id, p_type, p_tone, p_trigger_traces, p_extra_data)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 5. Turn-based sending ═══
CREATE OR REPLACE FUNCTION can_send_trace(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_pair_id uuid;
  v_has_open boolean;
  v_daily_count int;
  v_last_sender uuid;
BEGIN
  SELECT pair_id INTO v_pair_id FROM public.users WHERE id = p_user_id;
  IF v_pair_id IS NULL THEN RETURN false; END IF;

  -- Has undiscovered outgoing trace?
  SELECT EXISTS(
    SELECT 1 FROM public.traces t WHERE t.sender_id = p_user_id AND t.discovered_at IS NULL
  ) INTO v_has_open;
  IF v_has_open THEN RETURN false; END IF;

  -- Daily limit
  SELECT count(*) FROM public.traces t
  WHERE t.sender_id = p_user_id AND t.created_at > now() - interval '24 hours'
  INTO v_daily_count;
  IF v_daily_count >= 5 THEN RETURN false; END IF;

  -- Turn-based: who sent the last trace?
  SELECT sender_id INTO v_last_sender
  FROM public.traces
  WHERE pair_id = v_pair_id
  ORDER BY created_at DESC LIMIT 1;

  -- No traces yet = can send
  IF v_last_sender IS NULL THEN RETURN true; END IF;
  -- Last was from partner = your turn
  IF v_last_sender != p_user_id THEN RETURN true; END IF;
  -- Last was from you = wait
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 6. Ensure realtime is enabled ═══
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pair_proposals; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
