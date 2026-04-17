-- ══════════════════════════════════════════
-- RESONA — Security & Bug Fixes Migration
-- Run ONCE after all previous migrations.
-- ══════════════════════════════════════════

-- ═══ 1. Add discovery_mode column to traces (Bug 12) ═══
ALTER TABLE public.traces
  ADD COLUMN IF NOT EXISTS discovery_mode TEXT DEFAULT 'stillness'
  CHECK (discovery_mode IN ('stillness', 'wake', 'follow'));

-- ═══ 2. Fix pairs_select: remove pending-code leak (S5) ═══
-- Before fix: status = 'pending' let any auth user enumerate all invite codes.
-- join_pair is SECURITY DEFINER and bypasses RLS — no need to expose pending rows.
DROP POLICY IF EXISTS "pairs_select" ON public.pairs;
CREATE POLICY "pairs_select" ON public.pairs FOR SELECT USING (
  user_a_id = auth.uid() OR user_b_id = auth.uid()
);

-- ═══ 3. Drop direct pairs_update (S6) ═══
-- All pair mutations go through SECURITY DEFINER RPCs (join_pair, dissolve_pair).
-- Direct client UPDATE on pairs is never needed and enables identity-column rewrites.
DROP POLICY IF EXISTS "pairs_update" ON public.pairs;

-- ═══ 4. Null out invite_code on join to prevent code reuse (S17) ═══
CREATE OR REPLACE FUNCTION join_pair(p_code text)
RETURNS jsonb AS $$
DECLARE
  v_pair record;
BEGIN
  SELECT * INTO v_pair FROM public.pairs
  WHERE invite_code = upper(p_code)
    AND status = 'pending'
    AND invite_expires_at > now()
  LIMIT 1;
  IF v_pair IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid or expired code');
  END IF;
  IF v_pair.user_a_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'Cannot join your own pair');
  END IF;
  UPDATE public.pairs
    SET user_b_id = auth.uid(),
        status = 'active',
        invite_code = NULL,
        invite_expires_at = NULL
  WHERE id = v_pair.id;
  UPDATE public.users SET pair_id = v_pair.id WHERE id = auth.uid();
  RETURN jsonb_build_object('pair_id', v_pair.id, 'status', 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 5. Fix traces_insert: enforce sender_id = auth.uid() (S1) ═══
DROP POLICY IF EXISTS "traces_insert" ON public.traces;
CREATE POLICY "traces_insert" ON public.traces FOR INSERT WITH CHECK (
  traces.sender_id = auth.uid()
  AND traces.pair_id IN (
    SELECT p.id FROM public.pairs p
    WHERE p.user_a_id = auth.uid() OR p.user_b_id = auth.uid()
  )
);

-- ═══ 6. Fix traces_update: only receiver can mark discovered (S2) ═══
-- The only legitimate trace update is discoverTrace() which sets discovered_at.
-- Restrict to: receiver only, and only for traces in their pair.
DROP POLICY IF EXISTS "traces_update" ON public.traces;
CREATE POLICY "traces_update" ON public.traces FOR UPDATE USING (
  traces.receiver_id = auth.uid()
  AND traces.pair_id IN (
    SELECT p.id FROM public.pairs p
    WHERE p.user_a_id = auth.uid() OR p.user_b_id = auth.uid()
  )
);

-- ═══ 7. Fix events_insert: drop direct insert, route through RPC only (S3) ═══
-- create_resonance_event RPC (below) is the only allowed path.
DROP POLICY IF EXISTS "events_insert" ON public.resonance_events;

-- ═══ 8. Fix create_resonance_event RPC: enforce sender_id (S3 / S13) ═══
-- Caller-supplied sender_id in extra_data is overwritten with auth.uid().
DROP FUNCTION IF EXISTS create_resonance_event(uuid, text, text, uuid[], jsonb);
CREATE OR REPLACE FUNCTION create_resonance_event(
  p_pair_id uuid, p_type text, p_tone text,
  p_trigger_traces uuid[], p_extra_data jsonb
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
  v_extra jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND pair_id = p_pair_id
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  -- Always overwrite sender_id with actual caller — prevents spoofing
  v_extra := COALESCE(p_extra_data, '{}'::jsonb)
    || jsonb_build_object('sender_id', auth.uid()::text);

  INSERT INTO public.resonance_events (pair_id, type, tone, trigger_traces, extra_data)
  VALUES (p_pair_id, p_type, p_tone, p_trigger_traces, v_extra)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 9. Fix artwork_insert: enforce sender_id = auth.uid() (S4) ═══
DROP POLICY IF EXISTS "artwork_insert" ON public.artwork_contributions;
CREATE POLICY "artwork_insert" ON public.artwork_contributions FOR INSERT WITH CHECK (
  artwork_contributions.sender_id = auth.uid()
  AND artwork_contributions.pair_id IN (
    SELECT p.id FROM public.pairs p
    WHERE p.user_a_id = auth.uid() OR p.user_b_id = auth.uid()
  )
);

-- ═══ 10. Fix proposals_insert: enforce proposed_by = auth.uid() (S11) ═══
DROP POLICY IF EXISTS "proposals_insert" ON public.pair_proposals;
CREATE POLICY "proposals_insert" ON public.pair_proposals FOR INSERT WITH CHECK (
  proposed_by = auth.uid()
  AND pair_id = (SELECT pair_id FROM public.users WHERE id = auth.uid())
);

-- ═══ 11. Add respond_to_proposal RPC: prevent self-accept (S12 / Bug 19) ═══
DROP FUNCTION IF EXISTS respond_to_proposal(uuid, boolean);
CREATE OR REPLACE FUNCTION respond_to_proposal(p_proposal_id uuid, p_accept boolean)
RETURNS void AS $$
DECLARE
  v_proposal record;
BEGIN
  SELECT * INTO v_proposal FROM public.pair_proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;

  -- Caller must be in the same pair
  IF v_proposal.pair_id != (SELECT pair_id FROM public.users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Cannot accept your own proposal
  IF p_accept AND v_proposal.proposed_by = auth.uid() THEN
    RAISE EXCEPTION 'Cannot accept your own proposal';
  END IF;

  UPDATE public.pair_proposals
  SET status = CASE WHEN p_accept THEN 'accepted'::text ELSE 'declined'::text END,
      responded_at = now()
  WHERE id = p_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION respond_to_proposal(uuid, boolean) TO authenticated;

-- ═══ 12. Rate limiting for recover_account (S7) ═══
CREATE TABLE IF NOT EXISTS public.recovery_attempts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  attempted_at timestamptz DEFAULT now()
);
ALTER TABLE public.recovery_attempts ENABLE ROW LEVEL SECURITY;
-- No direct-access policies needed — only accessed via SECURITY DEFINER functions

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_recovery_attempts_user_time
  ON public.recovery_attempts (user_id, attempted_at DESC);

DROP FUNCTION IF EXISTS recover_account(text, uuid);
CREATE OR REPLACE FUNCTION recover_account(p_token TEXT, p_new_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_user_id UUID;
  pair_rec RECORD;
  new_token TEXT;
  v_attempt_count int;
BEGIN
  IF auth.uid() != p_new_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Rate limit: max 5 attempts per hour per caller
  SELECT COUNT(*) INTO v_attempt_count
  FROM public.recovery_attempts
  WHERE user_id = p_new_user_id
    AND attempted_at > now() - interval '1 hour';

  IF v_attempt_count >= 5 THEN
    RETURN jsonb_build_object('error', 'rate_limited');
  END IF;

  -- Log this attempt before processing
  INSERT INTO public.recovery_attempts (user_id) VALUES (p_new_user_id);

  -- Find old user by token (case-insensitive)
  SELECT id INTO old_user_id
  FROM public.users
  WHERE upper(recovery_token) = upper(p_token)
    AND id != p_new_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  -- Find active pair
  SELECT * INTO pair_rec FROM public.pairs
  WHERE (user_a_id = old_user_id OR user_b_id = old_user_id)
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no_active_pair');
  END IF;

  -- Ensure new user row exists with pair linked
  INSERT INTO public.users (id, pair_id)
  VALUES (p_new_user_id, pair_rec.id)
  ON CONFLICT (id) DO UPDATE SET pair_id = pair_rec.id;

  -- Swap user ID in pair
  IF pair_rec.user_a_id = old_user_id THEN
    UPDATE public.pairs SET user_a_id = p_new_user_id WHERE id = pair_rec.id;
  ELSE
    UPDATE public.pairs SET user_b_id = p_new_user_id WHERE id = pair_rec.id;
  END IF;

  -- Migrate traces
  UPDATE public.traces SET sender_id   = p_new_user_id WHERE sender_id   = old_user_id;
  UPDATE public.traces SET receiver_id = p_new_user_id WHERE receiver_id = old_user_id;

  -- Migrate artwork contributions
  UPDATE public.artwork_contributions SET sender_id = p_new_user_id WHERE sender_id = old_user_id;

  -- Migrate resonance events (extra_data->sender_id is JSON string)
  UPDATE public.resonance_events
  SET extra_data = jsonb_set(extra_data, '{sender_id}', to_jsonb(p_new_user_id::text))
  WHERE pair_id = pair_rec.id
    AND extra_data->>'sender_id' = old_user_id::text;

  -- Migrate pair proposals
  UPDATE public.pair_proposals
  SET proposed_by = p_new_user_id
  WHERE pair_id = pair_rec.id AND proposed_by = old_user_id;

  -- Clear attempt log on success — no longer needed
  DELETE FROM public.recovery_attempts WHERE user_id = p_new_user_id;

  -- Assign fresh recovery token to new user
  LOOP
    new_token := upper(substring(encode(gen_random_bytes(4), 'hex'), 1, 6));
    BEGIN
      UPDATE public.users SET recovery_token = new_token WHERE id = p_new_user_id;
      IF FOUND THEN EXIT; END IF;
    EXCEPTION WHEN unique_violation THEN
    END;
  END LOOP;

  -- Remove old user row (all FKs already updated)
  DELETE FROM public.users WHERE id = old_user_id;

  RETURN jsonb_build_object('ok', true, 'pair_id', pair_rec.id, 'recovery_token', new_token);
END;
$$;

GRANT EXECUTE ON FUNCTION recover_account(TEXT, UUID) TO authenticated;

-- ═══ 13. Ensure realtime covers new table ═══
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.recovery_attempts; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
