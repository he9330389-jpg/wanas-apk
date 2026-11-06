-- Tighten the earlier chat-media policy: the requesting user must be an active
-- member of the exact group conversation whose message references this sender-owned object.
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
         and gm.deleted_at is null
         and split_part(storage.objects.name, '/', 1) = gm.sender_id::text
         and private.is_active_group_member(gm.conversation_id)
    )
  );
