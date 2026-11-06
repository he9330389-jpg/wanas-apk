-- أفكار جديدة لونس: اللحظات المميزة · الدائرة القريبة · الحالة المؤقتة
alter table public.profiles add column if not exists status_expires_at timestamptz;

create table if not exists public.story_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 24),
  created_at timestamptz not null default now()
);
alter table public.story_highlights enable row level security;
drop policy if exists "highlights_read" on public.story_highlights;
create policy "highlights_read" on public.story_highlights for select to authenticated using (true);
drop policy if exists "highlights_write_own" on public.story_highlights;
create policy "highlights_write_own" on public.story_highlights for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.close_circle (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.close_circle enable row level security;
drop policy if exists "circle_own" on public.close_circle;
create policy "circle_own" on public.close_circle for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
