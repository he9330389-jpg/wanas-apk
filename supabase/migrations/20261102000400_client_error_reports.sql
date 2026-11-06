-- بلاغات أخطاء التطبيق (كراش على الأجهزة الحقيقية) — الكتابة مسموحة للـanon، القراءة للمشرفين فقط.
create table if not exists public.client_error_reports (
  id uuid primary key default gen_random_uuid(),
  phase text not null check (phase in ('js-error', 'render-error', 'unhandled', 'launch')),
  message text not null,
  stack text,
  platform text,
  os_version text,
  app_version text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.client_error_reports enable row level security;

drop policy if exists "anyone can insert error reports" on public.client_error_reports;
create policy "anyone can insert error reports"
  on public.client_error_reports
  for insert
  to anon, authenticated
  with check (char_length(message) between 1 and 4000);

drop policy if exists "admins can read error reports" on public.client_error_reports;
create policy "admins can read error reports"
  on public.client_error_reports
  for select
  to authenticated
  using (private.is_moderator());

create index if not exists client_error_reports_created_at_idx
  on public.client_error_reports (created_at desc);
