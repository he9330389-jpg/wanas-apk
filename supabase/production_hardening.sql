-- WANAS production hardening (non-destructive)
-- Run once AFTER supabase/schema.sql. This script does not delete user rows.
-- Review bucket settings first if a bucket named "posts" already exists.

begin;

-- Expose only fields needed by the client. Birth dates and other private columns
-- are intentionally not selectable through the anon/authenticated API roles.
revoke select on table public.profiles from anon, authenticated;
grant select (id, username, display_name, bio, avatar_url, cover_url, is_verified,
              created_at)
  on table public.profiles to anon, authenticated;

-- Client apps must not be able to manufacture notifications for other users.
-- Trusted database triggers / server-side jobs may insert them as their owner.
drop policy if exists "notif insert" on public.notifications;

commit;

-- Private bucket for post images. Existing bucket configuration is left untouched.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posts', 'posts', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

drop policy if exists "WANAS post images upload own folder" on storage.objects;
create policy "WANAS post images upload own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'posts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "WANAS post images visible with post" on storage.objects;
create policy "WANAS post images visible with post"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'posts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.posts p
        where p.media_urls @> array[storage.objects.name]::text[]
      )
    )
  );

drop policy if exists "WANAS post images delete own folder" on storage.objects;
create policy "WANAS post images delete own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'posts' and (storage.foldername(name))[1] = auth.uid()::text);


-- Create notifications from trusted database-side activity, not direct client writes.
create or replace function public.create_social_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_id uuid;
  actor_id uuid;
  target_post uuid;
  notification_type text;
begin
  if tg_table_name = 'friend_requests' then
    if new.status <> 'pending' then return new; end if;
    target_id := new.to_user;
    actor_id := new.from_user;
    notification_type := 'friend_request';
  else
    target_post := new.post_id;
    actor_id := new.user_id;
    notification_type := case when tg_table_name = 'likes' then 'like' else 'comment' end;
    select p.user_id into target_id from public.posts p where p.id = target_post;
  end if;

  if target_id is not null and actor_id is not null and target_id <> actor_id then
    insert into public.notifications (user_id, type, from_user, post_id)
    values (target_id, notification_type, actor_id, target_post);
  end if;
  return new;
end;
$$;

revoke all on function public.create_social_notification() from public, anon, authenticated;

drop trigger if exists wanas_notify_like on public.likes;
create trigger wanas_notify_like after insert on public.likes
for each row execute function public.create_social_notification();

drop trigger if exists wanas_notify_comment on public.comments;
create trigger wanas_notify_comment after insert on public.comments
for each row execute function public.create_social_notification();

drop trigger if exists wanas_notify_friend_request on public.friend_requests;
create trigger wanas_notify_friend_request after insert on public.friend_requests
for each row execute function public.create_social_notification();
