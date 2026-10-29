-- WANAS schema v2 — شغّله كله مرة واحدة في Supabase → SQL Editor
-- فيه: 23 جدول + RLS على كل الجداول + سياسات الخصوصية + عدّادات تلقائية + إنشاء بروفايل عند التسجيل + حذف الحساب

-- ============ الجداول ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9._]{3,30}$'),
  display_name text,
  bio text,
  avatar_url text,
  cover_url text,
  birth_date date,
  profile_link text generated always as ('https://wanas.app/@' || username) stored,
  is_verified boolean not null default false,
  quiet_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  media_urls text[] not null default '{}',
  media_type text not null default 'none' check (media_type in ('image','video','audio','mixed','none')),
  privacy text not null default 'public' check (privacy in ('only_me','friends','friends_of_friends','public','public_except_friends','custom')),
  hidden_from uuid[] not null default '{}',
  comment_setting text not null default 'everyone' check (comment_setting in ('everyone','mentioned_only','friends','none','custom')),
  comment_blocked_ids uuid[] not null default '{}',
  is_archived boolean not null default false,
  is_edited boolean not null default false,
  edited_at timestamptz,
  reposts_count int not null default 0,
  shares_count int not null default 0,
  saves_count int not null default 0,
  likes_count int not null default 0,
  comments_count int not null default 0,
  created_at timestamptz not null default now()
);

create table public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  content text not null,
  parent_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.reposts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  content text,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  share_type text not null default 'wanas' check (share_type in ('wanas','direct','copy','external')),
  created_at timestamptz not null default now()
);

create table public.saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image','video')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  viewers uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  unique (from_user, to_user),
  check (from_user <> to_user)
);

-- العلاقة بتتخزن مرة واحدة والأصغر أولاً (user_a < user_b)
create table public.friends (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_post_id uuid references public.posts(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete cascade,
  reason text not null,
  type text not null check (type in ('post','user')),
  status text not null default 'pending' check (status in ('pending','reviewed','actioned','dismissed')),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('like','comment','repost','share','friend_request','birthday','mention')),
  from_user uuid references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  content text,
  media_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.profiles(id) on delete cascade,
  participant_b uuid not null references public.profiles(id) on delete cascade,
  last_message_id uuid references public.messages(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (participant_a, participant_b)
);

create table public.archives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  archived_at timestamptz not null default now()
);

create table public.profile_views (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  query text not null,
  searched_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text unique not null,
  posts_count int not null default 0,
  created_at timestamptz not null default now()
);

create table public.post_hashtags (
  post_id uuid references public.posts(id) on delete cascade,
  hashtag_id uuid references public.hashtags(id) on delete cascade,
  primary key (post_id, hashtag_id)
);

create table public.files_division (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_url text not null,
  file_type text not null check (file_type in ('photo','video','writing','file')),
  file_name text,
  file_size int,
  post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.birthdays_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  birth_date date not null,
  notify_friends boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index posts_user_created_idx on public.posts (user_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc);
create index likes_post_idx on public.likes (post_id);
create index comments_post_idx on public.comments (post_id);
create index messages_pair_idx on public.messages (from_user, to_user, created_at desc);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ============ دوال مساعدة ============
create function public.is_friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friends f
    where (f.user_a = a and f.user_b = b) or (f.user_a = b and f.user_b = a));
$$;

create function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks k
    where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a));
$$;

create function public.has_mutual_friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from (select case when f.user_a = a then f.user_b else f.user_a end as friend
          from public.friends f where a in (f.user_a, f.user_b)) x
    join (select case when f.user_a = b then f.user_b else f.user_a end as friend
          from public.friends f where b in (f.user_a, f.user_b)) y
      on x.friend = y.friend);
$$;

-- مين يقدر يشوف البوست (بيطبّق إعدادات الخصوصية PRIV-004 والأرشيف والحظر)
create function public.can_view_post(owner uuid, privacy text, hidden uuid[], archived boolean)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is not null and uid = owner then return true; end if;
  if archived then return false; end if;
  if uid is null then return privacy = 'public'; end if;
  if public.is_blocked(uid, owner) or uid = any(hidden) then return false; end if;
  return case privacy
    when 'public' then true
    when 'custom' then true
    when 'friends' then public.is_friend(uid, owner)
    when 'friends_of_friends' then public.is_friend(uid, owner) or public.has_mutual_friend(uid, owner)
    when 'public_except_friends' then not public.is_friend(uid, owner)
    else false end;
end $$;

-- ============ إنشاء البروفايل تلقائياً عند التسجيل ============
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(coalesce(nullif(new.raw_user_meta_data->>'username', ''),
                               'user_' || substr(replace(new.id::text, '-', ''), 1, 8)));
  dname text := coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), uname);
begin
  begin
    insert into public.profiles (id, username, display_name) values (new.id, uname, dname);
  exception when unique_violation or check_violation then
    insert into public.profiles (id, username, display_name)
    values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 12), dname);
  end;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ============ العدّادات التلقائية ============
create function public.bump_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  col text := tg_argv[0];
  pid uuid := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  d int := case when tg_op = 'DELETE' then -1 else 1 end;
begin
  execute format('update public.posts set %I = greatest(%I + $1, 0) where id = $2', col, col) using d, pid;
  return null;
end $$;

create trigger likes_count    after insert or delete on public.likes    for each row execute function public.bump_count('likes_count');
create trigger comments_count after insert or delete on public.comments for each row execute function public.bump_count('comments_count');
create trigger reposts_count  after insert or delete on public.reposts  for each row execute function public.bump_count('reposts_count');
create trigger shares_count   after insert or delete on public.shares   for each row execute function public.bump_count('shares_count');
create trigger saves_count    after insert or delete on public.saves    for each row execute function public.bump_count('saves_count');

-- ============ قبول الصداقة وحذف الحساب ============
create function public.accept_friend_request(request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.friend_requests;
begin
  select * into r from public.friend_requests
   where id = request_id and to_user = auth.uid() and status = 'pending';
  if not found then raise exception 'request not found'; end if;
  update public.friend_requests set status = 'accepted' where id = request_id;
  insert into public.friends (user_a, user_b)
  values (least(r.from_user, r.to_user), greatest(r.from_user, r.to_user))
  on conflict do nothing;
end $$;

-- حذف الحساب من جوّه التطبيق (مطلوب من آبل وجوجل)
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.accept_friend_request(uuid), public.delete_my_account() from public, anon;
grant execute on function public.accept_friend_request(uuid), public.delete_my_account() to authenticated;

-- ============ تفعيل RLS على كل الجداول ============
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ============ صلاحيات الأعمدة (العدّادات والتوثيق مش بيتعدّلوا من العميل) ============
revoke update on public.profiles from authenticated, anon;
grant update (username, display_name, bio, avatar_url, cover_url, birth_date, quiet_mode, updated_at)
  on public.profiles to authenticated;

revoke update on public.posts from authenticated, anon;
grant update (content, media_urls, media_type, privacy, hidden_from, comment_setting,
              comment_blocked_ids, is_archived, is_edited, edited_at) on public.posts to authenticated;

revoke update on public.messages from authenticated, anon;
grant update (is_read) on public.messages to authenticated;

revoke update on public.notifications from authenticated, anon;
grant update (is_read) on public.notifications to authenticated;

-- ============ السياسات ============
-- profiles
create policy "profiles read" on public.profiles for select using (true);
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- posts
create policy "posts read" on public.posts for select
  using (public.can_view_post(user_id, privacy, hidden_from, is_archived));
create policy "posts insert own" on public.posts for insert to authenticated
  with check (user_id = auth.uid() and likes_count = 0 and comments_count = 0
              and reposts_count = 0 and shares_count = 0 and saves_count = 0);
create policy "posts update own" on public.posts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "posts delete own" on public.posts for delete to authenticated
  using (user_id = auth.uid());

-- likes / saves / reposts / shares (تتحقق إن البوست مسموح تشوفه)
create policy "likes read" on public.likes for select using (exists (select 1 from public.posts p where p.id = post_id));
create policy "likes insert" on public.likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
create policy "likes delete own" on public.likes for delete to authenticated using (user_id = auth.uid());

create policy "saves own read" on public.saves for select to authenticated using (user_id = auth.uid());
create policy "saves insert" on public.saves for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
create policy "saves delete own" on public.saves for delete to authenticated using (user_id = auth.uid());

create policy "reposts read" on public.reposts for select using (exists (select 1 from public.posts p where p.id = post_id));
create policy "reposts insert" on public.reposts for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
create policy "reposts delete own" on public.reposts for delete to authenticated using (user_id = auth.uid());

create policy "shares own read" on public.shares for select to authenticated using (user_id = auth.uid());
create policy "shares insert" on public.shares for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));

-- comments (COMMENT-005)
create policy "comments read" on public.comments for select using (exists (select 1 from public.posts p where p.id = post_id));
create policy "comments insert" on public.comments for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.posts p
    where p.id = post_id
      and (p.user_id = auth.uid() or case p.comment_setting
        when 'everyone' then true
        when 'friends' then public.is_friend(auth.uid(), p.user_id)
        when 'mentioned_only' then p.content ilike '%@' || (select username from public.profiles where id = auth.uid()) || '%'
        when 'custom' then not (auth.uid() = any(p.comment_blocked_ids))
        else false end)));
create policy "comments delete own" on public.comments for delete to authenticated using (user_id = auth.uid());

-- stories
create policy "stories read" on public.stories for select to authenticated using (
  user_id = auth.uid()
  or (expires_at > now() and public.is_friend(auth.uid(), user_id) and not public.is_blocked(auth.uid(), user_id)));
create policy "stories insert own" on public.stories for insert to authenticated with check (user_id = auth.uid());
create policy "stories delete own" on public.stories for delete to authenticated using (user_id = auth.uid());

-- friend requests / friends
create policy "fr read" on public.friend_requests for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());
create policy "fr insert" on public.friend_requests for insert to authenticated
  with check (from_user = auth.uid() and status = 'pending' and not public.is_blocked(from_user, to_user));
create policy "fr decline" on public.friend_requests for update to authenticated
  using (to_user = auth.uid()) with check (to_user = auth.uid() and status in ('declined','blocked'));
create policy "fr cancel" on public.friend_requests for delete to authenticated using (from_user = auth.uid());

create policy "friends read" on public.friends for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());
create policy "friends delete" on public.friends for delete to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- blocks / reports
create policy "blocks own" on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy "reports insert" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "reports own read" on public.reports for select to authenticated using (reporter_id = auth.uid());

-- notifications
create policy "notif read own" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif insert" on public.notifications for insert to authenticated
  with check (from_user = auth.uid() and user_id <> auth.uid());
create policy "notif update own" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notif delete own" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- messages / conversations
create policy "msg read" on public.messages for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());
create policy "msg insert" on public.messages for insert to authenticated
  with check (from_user = auth.uid() and not public.is_blocked(from_user, to_user));
create policy "msg mark read" on public.messages for update to authenticated
  using (to_user = auth.uid()) with check (to_user = auth.uid());
create policy "msg delete own" on public.messages for delete to authenticated using (from_user = auth.uid());

create policy "conv own" on public.conversations for all to authenticated
  using (participant_a = auth.uid() or participant_b = auth.uid())
  with check (participant_a = auth.uid() or participant_b = auth.uid());

-- أشياء شخصية
create policy "archives own" on public.archives for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "search own" on public.search_history for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "files own" on public.files_division for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pv read" on public.profile_views for select to authenticated
  using (viewer_id = auth.uid() or viewed_id = auth.uid());
create policy "pv insert" on public.profile_views for insert to authenticated
  with check (viewer_id = auth.uid() and viewer_id <> viewed_id);

-- أعياد الميلاد: صاحب الحساب وأصحابه بس
create policy "bday read" on public.birthdays_cache for select to authenticated
  using (user_id = auth.uid() or (notify_friends and public.is_friend(auth.uid(), user_id)));
create policy "bday own write" on public.birthdays_cache for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- هاشتاجات وإعدادات التطبيق
create policy "hashtags read" on public.hashtags for select using (true);
create policy "hashtags insert" on public.hashtags for insert to authenticated with check (posts_count = 0);
create policy "post_hashtags read" on public.post_hashtags for select
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy "post_hashtags insert" on public.post_hashtags for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));
create policy "settings read" on public.app_settings for select using (true);
-- app_settings: مفيش سياسة كتابة، التعديل من لوحة Supabase بس
