-- Resona: Recovery Code System
-- Run in Supabase SQL Editor

-- Add recovery_token column to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS recovery_token TEXT UNIQUE;

-- Generate a unique 6-character recovery token for a user
CREATE OR REPLACE FUNCTION generate_recovery_token(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_token TEXT;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  LOOP
    new_token := upper(substring(encode(gen_random_bytes(4), 'hex'), 1, 6));
    BEGIN
      UPDATE public.users SET recovery_token = new_token WHERE id = p_user_id;
      IF FOUND THEN EXIT; END IF;
    EXCEPTION WHEN unique_violation THEN
      -- retry on collision
    END;
  END LOOP;
  RETURN new_token;
END;
$$;

-- Recover account: transfer all data from old user to new anonymous user
-- Called by the new anon session. Transfers pair membership + all linked rows.
CREATE OR REPLACE FUNCTION recover_account(p_token TEXT, p_new_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_user_id UUID;
  pair_rec RECORD;
  new_token TEXT;
BEGIN
  IF auth.uid() != p_new_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

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

-- Grant execute to authenticated (anon users are authenticated after signInAnonymously)
GRANT EXECUTE ON FUNCTION generate_recovery_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION recover_account(TEXT, UUID) TO authenticated;
