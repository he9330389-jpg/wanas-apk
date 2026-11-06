-- زوار الركن: كل زيارة لملف شخص بتتسجل، وصاحب الملف بس هو اللي يشوفها.
create table if not exists public.profile_visits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  visitor_id uuid not null references public.profiles(id) on delete cascade,
  visited_at timestamptz not null default now()
);
create index if not exists profile_visits_profile_idx on public.profile_visits (profile_id, visited_at desc);
alter table public.profile_visits enable row level security;

drop policy if exists "visits_insert_own" on public.profile_visits;
create policy "visits_insert_own" on public.profile_visits for insert to authenticated
  with check (visitor_id = auth.uid() and profile_id <> auth.uid());

drop policy if exists "visits_select_owner" on public.profile_visits;
create policy "visits_select_owner" on public.profile_visits for select to authenticated
  using (profile_id = auth.uid());
