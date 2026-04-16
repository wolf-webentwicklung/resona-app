-- ══════════════════════════════════════════
-- RESONANCE — Complete Database Reset
-- Run AFTER supabase-migration.sql
-- Deletes ALL data: traces, artwork, events, proposals, pairs, users.
-- Only the auth.users table (managed by Supabase Auth) stays.
-- After this, everyone needs to reconnect fresh.
-- ══════════════════════════════════════════

-- Content first (foreign key order)
do $$ begin execute 'delete from public.pair_proposals'; exception when others then null; end $$;
delete from public.artwork_contributions;
delete from public.resonance_events;
delete from public.traces;

-- Unlink users from pairs
update public.users set pair_id = null;

-- Delete all pairs
delete from public.pairs;

-- Verify everything is empty
select 'pairs' as t, count(*) as n from public.pairs
union all select 'traces', count(*) from public.traces
union all select 'artwork_contributions', count(*) from public.artwork_contributions
union all select 'resonance_events', count(*) from public.resonance_events;
