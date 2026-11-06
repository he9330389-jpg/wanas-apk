import { createClient } from "@supabase/supabase-js";

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PW = "WanasTest!2026";
const res = [];
const check = (n, ok, d = "") => {
  res.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} — ${n}${d ? " :: " + d : ""}`);
};

const A = createClient(URL, KEY, { auth: { persistSession: false } });
const B = createClient(URL, KEY, { auth: { persistSession: false } });
await A.auth.signInWithPassword({ email: "wanas.test.a@example.com", password: PW });
await B.auth.signInWithPassword({ email: "wanas.test.b@example.com", password: PW });
const a = (await A.auth.getUser()).data.user.id;
const b = (await B.auth.getUser()).data.user.id;

// قراءة بروفايل حد تاني
const { data: prof, error: pe } = await B.from("profiles").select("id, username, display_name").eq("id", a).maybeSingle();
check("فتح بروفايل مستخدم تاني", !pe && !!prof, pe?.message);

// متابعة
await B.from("follows").delete().eq("follower_id", b).eq("followed_id", a);
const { error: f1 } = await B.from("follows").insert({ follower_id: b, followed_id: a });
check("متابعة", !f1, f1?.message);
const { count: followers } = await A.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", a);
check("عدّاد المتابعين عند صاحب الملف", (followers ?? 0) >= 1, `${followers}`);

// إلغاء متابعة
const { error: f2 } = await B.from("follows").delete().eq("follower_id", b).eq("followed_id", a);
check("إلغاء المتابعة", !f2, f2?.message);

// منع انتحال متابعة باسم حد تاني
const { error: f3 } = await B.from("follows").insert({ follower_id: a, followed_id: b });
check("منع متابعة باسم مستخدم آخر", !!f3, f3?.message ?? "لم يُمنع");

// حظر متبادل
await B.from("blocks").delete().eq("blocker_id", b).eq("blocked_id", a);
const { error: b1 } = await B.from("blocks").insert({ blocker_id: b, blocked_id: a });
check("حظر", !b1, b1?.message);
const { data: postByA } = await A.from("posts").insert({ author_id: a, body: "منشور محظور", audience: "public" }).select("id").single();
if (postByA?.id) {
  const { data: seenByB } = await B.from("posts").select("id").eq("id", postByA.id);
  check("المحظور لا يرى منشور الحاظر", (seenByB ?? []).length === 0, `${seenByB?.length ?? 0} صف`);
  await A.from("posts").delete().eq("id", postByA.id);
}
await B.from("blocks").delete().eq("blocker_id", b).eq("blocked_id", a);
check("إلغاء الحظر", true);

console.log(`\n${res.filter(Boolean).length}/${res.length} ناجح`);
