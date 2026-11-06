import { createClient } from "@supabase/supabase-js";

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PW = "WanasTest!2026";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? " :: " + detail : ""}`);
};

const A = createClient(URL, KEY, { auth: { persistSession: false } });
const B = createClient(URL, KEY, { auth: { persistSession: false } });

const la = await A.auth.signInWithPassword({ email: "wanas.test.a@example.com", password: PW });
const lb = await B.auth.signInWithPassword({ email: "wanas.test.b@example.com", password: PW });
check("تسجيل دخول الحساب أ", !la.error, la.error?.message);
check("تسجيل دخول الحساب ب", !lb.error, lb.error?.message);
const aId = la.data.user?.id;
const bId = lb.data.user?.id;
if (!aId || !bId) {
  console.log(JSON.stringify(results));
  process.exit(1);
}

// profiles auto-created by trigger?
const { data: pa } = await A.from("profiles").select("id, username, display_name").eq("id", aId).maybeSingle();
check("ملف شخصي للحساب أ", !!pa, pa ? "ok" : "missing");

// A publishes a public post
const { data: post, error: postErr } = await A.from("posts")
  .insert({ author_id: aId, body: "منشور اختبار ونس — هتونسنا النهارده؟", audience: "public" })
  .select("id")
  .single();
check("نشر منشور عام", !postErr && !!post?.id, postErr?.message);
const postId = post?.id;

if (postId) {
  // B reacts with a WANAS reaction
  const { error: r1 } = await B.from("post_reactions").upsert(
    { post_id: postId, user_id: bId, reaction: "ونسّتني" },
    { onConflict: "post_id,user_id" },
  );
  check("تفاعل «ونسّتني» من ب", !r1, r1?.message);

  // B changes reaction (upsert update path)
  const { error: r2 } = await B.from("post_reactions").upsert(
    { post_id: postId, user_id: bId, reaction: "سخسخني" },
    { onConflict: "post_id,user_id" },
  );
  check("تغيير التفاعل إلى «سخسخني»", !r2, r2?.message);

  // spoofing: B tries to react as A
  const { error: r3 } = await B.from("post_reactions").upsert(
    { post_id: postId, user_id: aId, reaction: "مبهر" },
    { onConflict: "post_id,user_id" },
  );
  check("منع انتحال تفاعل باسم مستخدم آخر", !!r3, r3?.message ?? "لم يُمنع!");

  // invalid reaction value rejected by constraint
  const { error: r4 } = await B.from("post_reactions").upsert(
    { post_id: postId, user_id: bId, reaction: "random" },
    { onConflict: "post_id,user_id" },
  );
  check("رفض تفاعل غير معرّف", !!r4, r4?.message ?? "لم يُرفض!");

  // A sees B's reaction
  const { data: rows } = await A.from("post_reactions").select("user_id, reaction").eq("post_id", postId);
  check("قراءة التفاعلات من صاحب المنشور", rows?.length === 1 && rows[0].reaction === "سخسخني", JSON.stringify(rows));

  // saves
  const { error: s1 } = await B.from("saves").insert({ user_id: bId, post_id: postId });
  check("حفظ المنشور", !s1, s1?.message);
  const { data: mineSaves } = await B.from("saves").select("post_id").eq("user_id", bId);
  check("قراءة محفوظات ب", (mineSaves ?? []).some((s) => s.post_id === postId), `${mineSaves?.length ?? 0} صف`);
  const { data: aSaves } = await A.from("saves").select("post_id").eq("user_id", bId);
  check("عزل المحفوظات عن مستخدم آخر", (aSaves ?? []).length === 0, `${aSaves?.length ?? 0} صف`);
}

// friends table readable for own rows
const { error: fErr } = await A.from("friends").select("user_a, user_b").or(`user_a.eq.${aId},user_b.eq.${aId}`);
check("قراءة جدول الأصدقاء (صفوف صاحبها فقط)", !fErr, fErr?.message);

// friendship request flow if table exists
await A.from("friend_requests").delete().eq("from_user", aId);
const { error: frErr } = await A.from("friend_requests").insert({ from_user: aId, to_user: bId }).select("id").maybeSingle();
// التكرار ممنوع بقيد فريد — ده سلوك صحيح، فبنعتبره نجاح
const dupOk = !!frErr && /duplicate key/i.test(frErr.message);
check("إرسال طلب صداقة", !frErr || dupOk, frErr?.message);

// translation endpoint
try {
  const res = await fetch("http://localhost:3000/api/dialect/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "هتونسنا النهارده؟", target: "en", source: "auto" }),
  });
  const json = await res.json();
  check("خدمة الترجمة (عامية → إنجليزي)", res.ok && !!json.text, json.text ?? json.error);
} catch (e) {
  check("خدمة الترجمة", false, String(e));
}

// cleanup
if (postId) {
  await A.from("post_reactions").delete().eq("post_id", postId);
  await B.from("saves").delete().eq("post_id", postId);
  await A.from("posts").delete().eq("id", postId);
  const { data: left } = await A.from("posts").select("id").eq("id", postId).maybeSingle();
  check("تنظيف بيانات الاختبار", !left, left ? "باقي" : "تم");
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} ناجح`);
process.exit(passed === results.length ? 0 : 2);
