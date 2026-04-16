-- ══════════════════════════════════════════
-- RESONANCE — Complete Migration
-- Run ONCE after supabase-schema.sql.
-- Safe to re-run.
-- ══════════════════════════════════════════


-- ─── 1. Pair proposals (reunions + artwork resets) ───

create table if not exists public.pair_proposals (
  id uuid primary key default uuid_generate_v4(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  proposed_by uuid not null references public.users(id),
  type text not null default 'reunion' check (type in ('reunion','reset')),
  proposed_date date,
  status text default 'pending' check (status in ('pending','accepted','declined','completed')),
  created_at timestamptz default now(),
  responded_at timestamptz
);

alter table public.pair_proposals enable row level security;

drop policy if exists "proposals_select" on public.pair_proposals;
drop policy if exists "proposals_insert" on public.pair_proposals;
drop policy if exists "proposals_update" on public.pair_proposals;
drop policy if exists "proposals_delete" on public.pair_proposals;

create policy "proposals_select" on public.pair_proposals for select using (
  pair_id in (select p.id from public.pairs p where p.user_a_id = auth.uid() or p.user_b_id = auth.uid())
);
create policy "proposals_insert" on public.pair_proposals for insert with check (
  pair_id in (select p.id from public.pairs p where p.user_a_id = auth.uid() or p.user_b_id = auth.uid())
);
create policy "proposals_update" on public.pair_proposals for update using (
  pair_id in (select p.id from public.pairs p where p.user_a_id = auth.uid() or p.user_b_id = auth.uid())
);
create policy "proposals_delete" on public.pair_proposals for delete using (
  pair_id in (select p.id from public.pairs p where p.user_a_id = auth.uid() or p.user_b_id = auth.uid())
);


-- ─── 2. Reset artwork (server-side, called after both accept) ───

create or replace function reset_artwork(p_pair_id uuid)
returns void as $$
begin
  if not exists (
    select 1 from public.pairs where id = p_pair_id and (user_a_id = auth.uid() or user_b_id = auth.uid())
  ) then raise exception 'Not authorized'; end if;

  delete from public.artwork_contributions where pair_id = p_pair_id;
  delete from public.resonance_events where pair_id = p_pair_id;
end;
$$ language plpgsql security definer;


-- ─── 3. Updated dissolve_pair ───

create or replace function dissolve_pair()
returns void as $$
declare
  v_pair_id uuid;
begin
  select pair_id into v_pair_id from public.users where id = auth.uid();
  if v_pair_id is null then return; end if;

  delete from public.pair_proposals where pair_id = v_pair_id;
  delete from public.artwork_contributions where pair_id = v_pair_id;
  delete from public.resonance_events where pair_id = v_pair_id;
  delete from public.traces where pair_id = v_pair_id;
  update public.users set pair_id = null where pair_id = v_pair_id;
  update public.pairs set status = 'dissolved' where id = v_pair_id;
end;
$$ language plpgsql security definer;


-- ─── 4. Realtime ───

do $$
begin
  begin alter publication supabase_realtime add table public.traces; exception when others then null; end;
  begin alter publication supabase_realtime add table public.resonance_events; exception when others then null; end;
  begin alter publication supabase_realtime add table public.pairs; exception when others then null; end;
  begin alter publication supabase_realtime add table public.pair_proposals; exception when others then null; end;
end $$;
