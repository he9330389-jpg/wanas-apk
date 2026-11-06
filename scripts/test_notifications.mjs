import { createClient } from "@supabase/supabase-js";

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PW = "WanasTest!2026";
const out = [];
const check = (n, ok, d = "") => {
  out.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} — ${n}${d ? " :: " + d : ""}`);
};

const A = createClient(URL, KEY, { auth: { persistSession: false } });
const B = createClient(URL, KEY, { auth: { persistSession: false } });
await A.auth.signInWithPassword({ email: "wanas.test.a@example.com", password: PW });
await B.auth.signInWithPassword({ email: "wanas.test.b@example.com", password: PW });
const a = (await A.auth.getUser()).data.user.id;
const b = (await B.auth.getUser()).data.user.id;

// تنظيف
await A.from("notifications").delete().eq("recipient_id", a);
await B.from("notifications").delete().eq("recipient_id", b);

const { data: post, error: pe } = await A.from("posts")
  .insert({ author_id: a, body: "منشور لاختبار الإشعارات", audience: "public" })
  .select("id").single();
check("نشر منشور", !pe && !!post?.id, pe?.message);

if (post?.id) {
  await B.from("post_reactions").upsert({ post_id: post.id, user_id: b, reaction: "أحببته" }, { onConflict: "post_id,user_id" });
  await B.from("comments").insert({ post_id: post.id, author_id: b, body: "تعليق اختبار" });
}

await B.from("follows").upsert({ follower_id: b, followed_id: a }, { onConflict: "follower_id,followed_id" });

const { data: notes } = await A.from("notifications").select("kind, actor_id, read_at").eq("recipient_id", a);
const kinds = (notes ?? []).map((n) => n.kind);
check("إشعار تفاعل", kinds.includes("reaction"), kinds.join(","));
check("إشعار تعليق", kinds.includes("comment"));
check("إشعار متابعة", kinds.includes("follow"));

// عزل: ب مش يشوف إشعارات أ
const { data: bNotes } = await B.from("notifications").select("id").eq("recipient_id", a);
check("عزل الإشعارات بين المستخدمين", (bNotes ?? []).length === 0, `${bNotes?.length ?? 0} صف`);

// تعليم كمقروء
const first = notes?.[0];
if (first) {
  await A.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", a);
  const { data: after } = await A.from("notifications").select("read_at").eq("recipient_id", a).limit(50);
  check("تعليم الكل كمقروء", (after ?? []).every((n) => !!n.read_at));
}

// تنظيف
if (post?.id) {
  await A.from("comments").delete().eq("post_id", post.id);
  await A.from("post_reactions").delete().eq("post_id", post.id);
  await A.from("posts").delete().eq("id", post.id);
}
await A.from("follows").delete().eq("follower_id", b).eq("followed_id", a);
await A.from("notifications").delete().eq("recipient_id", a);
console.log(`\n${out.filter(Boolean).length}/${out.length} ناجح`);
