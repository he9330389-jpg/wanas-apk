-- تحديث شاشة الإشعارات (مواصفات ٤ نوفمبر ٢٠٢٦): تثبيت / إخفاء / حذف + تفاعل على التعليقات من الإشعار.
-- شغّل الملف ده مرة واحدة من Supabase → SQL Editor (أو supabase db push).

alter table public.notifications
  add column if not exists pinned_at timestamptz,
  add column if not exists hidden_at timestamptz;

create index if not exists notifications_recipient_pinned_idx
  on public.notifications (recipient_id, pinned_at desc nulls last, created_at desc);

-- صاحب الإشعار يقدر يعدّل ويحذف إشعاراته بس
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'notifications' and policyname = 'notifications_update_own') then
    create policy notifications_update_own on public.notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'notifications' and policyname = 'notifications_delete_own') then
    create policy notifications_delete_own on public.notifications for delete using (recipient_id = auth.uid());
  end if;
end $$;

-- تفاعل المستخدم مع تعليق (قلب) — نقرة تضيف، نقرة تانية تلغي
create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'like',
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_reactions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'comment_reactions' and policyname = 'comment_reactions_read') then
    create policy comment_reactions_read on public.comment_reactions for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'comment_reactions' and policyname = 'comment_reactions_write_own') then
    create policy comment_reactions_write_own on public.comment_reactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
