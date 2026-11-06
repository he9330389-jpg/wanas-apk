-- الميديا (صور/فيديو/صوت/PDF) لازم تظهر لكل الناس في آخر الأخبار والملفات الشخصية،
-- عشان كده الـ bucket بيبقى public للقراءة فقط. الرفع/التعديل/الحذف لسه مقتصر على صاحب الملف بمساره <userId>/<file>.
update storage.buckets set public = true where id = 'chat-media';

drop policy if exists "chat_media_public_read" on storage.objects;
create policy "chat_media_public_read" on storage.objects
  for select
  using (bucket_id = 'chat-media');

-- رفع/تعديل/حذف: صاحب المسار فقط
drop policy if exists "chat_media_owner_insert" on storage.objects;
create policy "chat_media_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat_media_owner_update" on storage.objects;
create policy "chat_media_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat_media_owner_delete" on storage.objects;
create policy "chat_media_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);
