-- ══════════════════════════════════════════
-- RESONA — Fixes Part 2
-- Run AFTER supabase-security-fixes.sql.
-- ══════════════════════════════════════════

-- ═══ 1. Bug 5: add turn_nudge type to resonance_events ═══
-- Separates "waiting for discovery" nudge from "it's your turn" reminder.
-- Prevents wrong cooldown suppression between the two distinct nudge intents.
ALTER TABLE public.resonance_events
  DROP CONSTRAINT IF EXISTS resonance_events_type_check;
ALTER TABLE public.resonance_events
  ADD CONSTRAINT resonance_events_type_check
  CHECK (type IN (
    'twin_connection', 'trace_convergence', 'amplified_reveal',
    'still_here', 'nudge', 'turn_nudge'
  ));

-- ═══ 2. S14: save_push_token RPC — validates endpoint before storing ═══
-- Prevents a user writing an arbitrary URL into push_token and using
-- the edge function as an SSRF relay to third-party push endpoints.
CREATE OR REPLACE FUNCTION save_push_token(p_token TEXT)
RETURNS void AS $$
DECLARE
  v_endpoint TEXT;
  v_parsed jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  -- Must be valid JSON
  BEGIN
    v_parsed := p_token::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid_subscription_json';
  END;

  v_endpoint := v_parsed->>'endpoint';
  IF v_endpoint IS NULL THEN RAISE EXCEPTION 'missing_endpoint'; END IF;

  -- Allowlist: only recognised push service domains
  IF NOT (
    v_endpoint LIKE 'https://fcm.googleapis.com/%'
    OR v_endpoint LIKE 'https://updates.push.services.mozilla.com/%'
    OR v_endpoint LIKE 'https://web.push.apple.com/%'
    OR v_endpoint LIKE 'https://push.apple.com/%'
    OR v_endpoint LIKE 'https://notify.windows.com/%'
    OR v_endpoint LIKE 'https://%push.services.mozilla.com/%'
  ) THEN
    RAISE EXCEPTION 'endpoint_not_allowed';
  END IF;

  UPDATE public.users SET push_token = p_token WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION save_push_token(TEXT) TO authenticated;
