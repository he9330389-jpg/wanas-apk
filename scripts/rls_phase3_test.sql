-- اختبار فعلي لعزل المرحلة 3: مستخدمان وهميان (يُحذفان في النهاية)
-- يتحقق من: كبسولة الذكرى (خاصة/عامة/مستقبلية)، الشّلة (عضو/غير عضو)، بطاقة الشكر،
-- حدود صحية (خاصة)، ونسة الصباح (الردود مرئية + التشجيع)، هدوء الصلاة (خاصة)، فصحى↔عامية.
drop table if exists rls_result;
create temp table rls_result (ok text, fail text);
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  squad_id uuid;
  capsule_private uuid;
  capsule_future uuid;
  capsule_public uuid;
  q_id uuid;
  card_id uuid;
  ok text := '';
  fail text := '';
  cnt int;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rlstest_a@wanas.test', 'x', now(), now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rlstest_b@wanas.test', 'x', now(), now(), now());

  -- ===== هدوء الصلاة: خاصة =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.prayer_settings (user_id, enabled, city) values (a, true, 'القاهرة');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.prayer_settings;
  reset role;
  if cnt = 0 then ok := ok || 'prayer:isolation ✓ '; else fail := fail || 'prayer:leak ✗ '; end if;

  -- ===== كبسولة الذكرى =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.memory_capsules (owner_id, title, audience, open_at)
    values (a, 'خاصة', 'private', now() - interval '1 day') returning id into capsule_private;
  insert into public.memory_capsules (owner_id, title, audience, open_at)
    values (a, 'بعد سنة', 'public', now() + interval '1 year') returning id into capsule_future;
  insert into public.memory_capsules (owner_id, title, audience, open_at)
    values (a, 'عامة فتحت', 'public', now() - interval '1 hour') returning id into capsule_public;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.memory_capsules where id = capsule_private;
  reset role;
  if cnt = 0 then ok := ok || 'capsule:private-hidden ✓ '; else fail := fail || 'capsule:private-leak ✗ '; end if;

  set local role authenticated;
  select count(*) into cnt from public.memory_capsules where id = capsule_future;
  reset role;
  if cnt = 0 then ok := ok || 'capsule:future-locked ✓ '; else fail := fail || 'capsule:future-visible ✗ '; end if;

  set local role authenticated;
  select count(*) into cnt from public.memory_capsules where id = capsule_public;
  reset role;
  if cnt = 1 then ok := ok || 'capsule:public-opened ✓ '; else fail := fail || 'capsule:public-missing ✗ '; end if;

  -- ===== الشّلة =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  squad_id := public.create_squad('شلّة الاختبار', '👥', 'masri', 5);
  reset role;
  if squad_id is not null then ok := ok || 'squad:created ✓ '; else fail := fail || 'squad:create-failed ✗ '; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.squads where id = squad_id;
  reset role;
  if cnt = 0 then ok := ok || 'squad:hidden-from-nonmember ✓ '; else fail := fail || 'squad:visible-to-nonmember ✗ '; end if;

  set local role authenticated;
  select count(*) into cnt from public.squad_members where squad_id = squad_id and user_id = b;
  reset role;
  if cnt = 0 then ok := ok || 'squad:members-hidden ✓ '; else fail := fail || 'squad:members-leak ✗ '; end if;

  -- انضمام بكود (متاح لكل المسجلين، الحد 15)
  declare code text;
  begin
    select invite_code into code from public.squads where id = squad_id;  -- المالك يقرأ الكود
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.join_squad_by_code(code);
    reset role;
    set local role authenticated;
    select count(*) into cnt from public.squad_members where squad_id = squad_id and user_id = b;
    reset role;
    if cnt = 1 then ok := ok || 'squad:join-by-code ✓ '; else fail := fail || 'squad:join-failed ✗ '; end if;
  end;

  -- ===== بطاقة شكر =====
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.thank_cards (sender_id, recipient_id, message)
      values (b, a, 'شكرًا') returning id into card_id;
    reset role;
    ok := ok || 'thank:without-post-rejected ✓ '; -- المفروض تفشل بسبب check(post_id or comment_id)
    fail := fail || 'thank:missing-target-check ✗ ';
  exception when others then
    reset role;
    ok := ok || 'thank:requires-post-or-comment ✓ ';
  end;

  -- ===== ونسة الصباح =====
  select id into q_id from public.morning_questions order by active_on limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.morning_answers (question_id, user_id, body) values (q_id, a, 'صباح الخير');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.morning_answers where question_id = q_id;
  reset role;
  if cnt >= 1 then ok := ok || 'morning:answers-visible ✓ '; else fail := fail || 'morning:answers-hidden ✗ '; end if;

  -- ===== حدود صحية =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.wellbeing_sessions (user_id, minutes) values (a, 40);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.wellbeing_sessions where user_id = a;
  reset role;
  if cnt = 0 then ok := ok || 'wellbeing:private ✓ '; else fail := fail || 'wellbeing:leak ✗ '; end if;

  -- ===== تنظيف =====
  delete from public.squads where id = squad_id;
  delete from public.memory_capsules where owner_id = a;
  delete from public.morning_answers where user_id = a;
  delete from public.wellbeing_sessions where user_id = a;
  delete from public.prayer_settings where user_id = a;
  delete from auth.users where id in (a, b);

  insert into rls_result (ok, fail) values (ok, fail);
end $$;

select * from rls_result;
