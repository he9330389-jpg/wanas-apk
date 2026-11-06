-- WANAS: صفحات، هدايا ونقاط ونس، ربح المنشئين، طلبات التوثيق، تعليقات صوتية وستيكرات.
-- كل التغييرات إضافية (additive) — مفيش حذف أو تعديل لبيانات قائمة.

-- 1) جمهور أوسع للمنشورات (الأصدقاء · أصدقاء الأصدقاء · الجميع ما عدا الأصدقاء)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'posts_audience_check' and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts drop constraint posts_audience_check;
  end if;
  alter table public.posts
    add constraint posts_audience_check
    check (audience in ('public', 'followers', 'friends', 'friends_of_friends', 'except_friends', 'private'));
exception when others then
  raise notice 'audience constraint skipped: %', sqlerrm;
end $$;

-- 2) إعدادات المنشور: التعليقات والتعديل/الأرشفة (إن لم تكن موجودة)
alter table public.posts add column if not exists allow_comments boolean not null default true;
alter table public.posts add column if not exists edited_at timestamptz;
alter table public.posts add column if not exists archived_at timestamptz;

-- 3) تعليقات صوتية وستيكرات وردود
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
alter table public.comments add column if not exists audio_path text;
alter table public.comments add column if not exists sticker_url text;
alter table public.comments add column if not exists updated_at timestamptz not null default now();
alter table public.comments alter column body drop not null;

-- 4) ستيكرات: بتتصنع من أي صورة (نفس ملف المستخدم) وبتتشارك في التعليقات والرسائل
create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  image_path text not null,
  created_at timestamptz not null default now()
);
alter table public.stickers enable row level security;

drop policy if exists "stickers owner all" on public.stickers;
create policy "stickers owner all" on public.stickers
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "stickers readable" on public.stickers;
create policy "stickers readable" on public.stickers
  for select to authenticated
  using (true);

-- 5) الصفحات
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  handle text not null unique,
  category text,
  about text,
  avatar_url text,
  cover_url text,
  is_verified boolean not null default false,
  verification_tone text,
  created_at timestamptz not null default now()
);
alter table public.pages enable row level security;

drop policy if exists "pages readable" on public.pages;
create policy "pages readable" on public.pages for select to authenticated using (true);

drop policy if exists "pages owner insert" on public.pages;
create policy "pages owner insert" on public.pages for insert to authenticated
  with check (owner_id = auth.uid() and is_verified = false);

drop policy if exists "pages owner update" on public.pages;
create policy "pages owner update" on public.pages for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "pages owner delete" on public.pages;
create policy "pages owner delete" on public.pages for delete to authenticated
  using (owner_id = auth.uid());

-- 6) الهدايا (نقاط ونس) — الحجم ثابت ومحدود، والرصيد بيتحسب من الجدول نفسه
create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  amount integer not null check (amount in (1, 5, 10, 25, 50, 100)),
  note text,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
alter table public.gifts enable row level security;

drop policy if exists "gifts sender insert" on public.gifts;
create policy "gifts sender insert" on public.gifts for insert to authenticated
  with check (sender_id = auth.uid());

drop policy if exists "gifts participant read" on public.gifts;
create policy "gifts participant read" on public.gifts for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- 7) ربح المنشئين — سجل حساب حقيقي مبني على الهدايا (1 نقطة = 0.05 جنيه مثلاً، بيتحسب في الواجهة)
create table if not exists public.creator_earnings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'gift',
  amount numeric(12, 2) not null default 0,
  note text,
  gift_id uuid references public.gifts(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.creator_earnings enable row level security;

drop policy if exists "earnings creator read" on public.creator_earnings;
create policy "earnings creator read" on public.creator_earnings for select to authenticated
  using (creator_id = auth.uid());

-- التحويل للرصيد: تريجر آمن يعمل بصلاحيات المالك
create or replace function private.gift_to_earning()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.creator_earnings (creator_id, source, amount, note, gift_id)
  values (new.recipient_id, 'gift', new.amount * 0.05, coalesce(new.note, 'هدية ونس'), new.id);
  return new;
end $$;

drop trigger if exists trg_gift_to_earning on public.gifts;
create trigger trg_gift_to_earning after insert on public.gifts
  for each row execute function private.gift_to_earning();

-- 8) طلبات التوثيق — المستخدم يطلب، والوسام بيتحط يدويًا/بمراجعة فقط (مفيش تزييف من التطبيق)
create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  link_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  tone text check (tone in ('red', 'orange', 'green', 'blue', 'yellow', 'purple')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, status) deferrable initially deferred
);
alter table public.verification_requests enable row level security;

drop policy if exists "verification own read" on public.verification_requests;
create policy "verification own read" on public.verification_requests for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "verification own insert" on public.verification_requests;
create policy "verification own insert" on public.verification_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- 9) ذكريات ونس — منشوراتك من نفس اليوم في سنين فاتت (دالة قراءة فقط)
create or replace function public.wanas_memories(p_limit integer default 20)
returns table (
  id uuid,
  body text,
  media_type text,
  created_at timestamptz,
  years_ago integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.id, p.body, p.media_type, p.created_at,
         extract(year from age(now(), p.created_at))::int as years_ago
  from public.posts p
  where p.author_id = auth.uid()
    and p.deleted_at is null
    and extract(month from p.created_at) = extract(month from now())
    and extract(day from p.created_at) = extract(day from now())
    and extract(year from p.created_at) < extract(year from now())
  order by p.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.wanas_memories(integer) to authenticated;

-- 10) صلاحيات القراءة/الكتابة للأعمدة الجديدة
grant select, insert, update on public.pages to authenticated;
grant select, insert on public.gifts to authenticated;
grant select on public.creator_earnings to authenticated;
grant select, insert on public.verification_requests to authenticated;
grant select, insert, update, delete on public.stickers to authenticated;
grant update (allow_comments, edited_at, archived_at) on public.posts to authenticated;
grant insert, update on public.comments to authenticated;
