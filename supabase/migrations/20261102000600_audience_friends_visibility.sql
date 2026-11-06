-- WANAS: جمهور المنشور بيدعم الأصدقاء وأصدقاء الأصدقاء والجميع ما عدا الأصدقاء.
-- التعليقات بتتبع نفس صلاحية رؤية المنشور (مفيش تعليق على منشور مش متاح ليك).

create or replace function private.can_view_post(p_post_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  actor uuid := auth.uid();
  post_author uuid;
  post_audience text;
  post_deleted timestamptz;
  is_friend boolean;
  friend_of_author uuid;
begin
  if actor is null or p_post_id is null then return false; end if;
  select p.author_id, p.audience, p.deleted_at
    into post_author, post_audience, post_deleted
    from public.posts p where p.id = p_post_id;
  if not found or post_deleted is not null then return false; end if;
  if actor = post_author then return true; end if;
  if exists (
    select 1 from public.blocks b
     where (b.blocker_id = actor and b.blocked_id = post_author)
        or (b.blocker_id = post_author and b.blocked_id = actor)
  ) then return false; end if;
  if exists (
    select 1 from public.muted_users m
     where m.muter_id = actor and m.muted_user_id = post_author
  ) then return false; end if;
  is_friend := exists (
    select 1 from public.friends f
     where (f.user_a = actor and f.user_b = post_author)
        or (f.user_a = post_author and f.user_b = actor)
  );
  if post_audience = 'public' then return true; end if;
  if post_audience = 'followers' then
    return exists (select 1 from public.follows f where f.follower_id = actor and f.followed_id = post_author);
  end if;
  if post_audience = 'friends' then return is_friend; end if;
  if post_audience = 'except_friends' then return not is_friend; end if;
  if post_audience = 'friends_of_friends' then
    if is_friend then return true; end if;
    for friend_of_author in
      select case when f.user_a = post_author then f.user_b else f.user_a end
        from public.friends f
       where f.user_a = post_author or f.user_b = post_author
    loop
      if exists (
        select 1 from public.friends f2
         where (f2.user_a = actor and f2.user_b = friend_of_author)
            or (f2.user_b = actor and f2.user_a = friend_of_author)
      ) then
        return true;
      end if;
    end loop;
    return false;
  end if;
  return false;
end;
$function$;

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments for insert to authenticated
  with check (author_id = auth.uid() and private.can_view_post(post_id));

drop policy if exists "comments_read_visible" on public.comments;
create policy "comments_read_visible" on public.comments for select to authenticated
  using (private.can_view_post(post_id));
