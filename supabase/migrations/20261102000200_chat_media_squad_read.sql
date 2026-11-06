-- Keep chat-media private. Active members may read an object only when a readable
-- group message references that exact storage path and the path belongs to its sender.
drop policy if exists chat_media_read_if_group_message_member on storage.objects;

create policy chat_media_read_if_group_message_member
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1
        from public.group_messages as gm
       where gm.media_url = storage.objects.name
         and split_part(storage.objects.name, '/', 1) = gm.sender_id::text
    )
  );
