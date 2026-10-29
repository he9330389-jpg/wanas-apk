import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './utils/supabase.js'
import MessagesPanel from './components/MessagesPanel.jsx'
import NotificationsPanel from './components/NotificationsPanel.jsx'

const PROFILE_FIELDS = 'id,username,display_name,bio,avatar_url,cover_url,is_verified,created_at'
const POST_FIELDS = 'id,user_id,content,media_urls,media_type,privacy,hidden_from,created_at,likes_count,comments_count,reposts_count,shares_count,saves_count'
const PUBLIC_APP_URL = (import.meta.env.VITE_APP_URL || 'https://wanas-apk-global.vercel.app').replace(/\/$/, '')
const shortError = (error) => error?.message || 'حدث خطأ. حاول مرة أخرى.'
const initials = (name = '') => (name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('') || 'و').toUpperCase()
const timeAgo = (date) => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000))
  if (seconds < 60) return 'الآن'
  if (seconds < 3600) return `منذ ${Math.floor(seconds / 60)} د`
  if (seconds < 86400) return `منذ ${Math.floor(seconds / 3600)} س`
  return `منذ ${Math.floor(seconds / 86400)} ي`
}

function Avatar({ profile, size = 'md' }) {
  const name = profile?.display_name || profile?.username || 'ونس'
  return profile?.avatar_url
    ? <img className={`avatar avatar-${size}`} src={profile.avatar_url} alt={name} loading="lazy" />
    : <span className={`avatar avatar-${size} avatar-fallback`} aria-label={name}>{initials(name)}</span>
}

function AppHeader({ profile, onSignOut, onDeleteAccount }) {
  const [open, setOpen] = useState(false)
  return <header className="app-header"><div className="header-inner">
    <div className="brand-lockup"><div className="brand-mark">و</div><span>وَنَس</span></div>
    <div className="header-actions">
      <button className="icon-button" title="قائمة الحساب" onClick={() => setOpen((v) => !v)}><Avatar profile={profile} size="sm" /></button>
      {open && <div className="account-menu">
        <strong>{profile?.display_name || profile?.username}</strong><span dir="ltr">@{profile?.username}</span>
        <button onClick={onSignOut}>تسجيل الخروج</button>
        <button className="danger-text" onClick={onDeleteAccount}>حذف الحساب نهائيًا</button>
      </div>}
    </div>
  </div></header>
}

function Composer({ profile, onCreated, notify }) {
  const [content, setContent] = useState('')
  const [privacy, setPrivacy] = useState('public')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const submit = async (event) => {
    event.preventDefault()
    if (!content.trim() && !file) return
    if (content.length > 5000) return notify('المنشور أطول من الحد المسموح (5000 حرف).', 'error')
    if (file && (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024)) return notify('اختر صورة لا يتجاوز حجمها 5 ميجابايت.', 'error')
    setBusy(true)
    let uploadedPath = null
    try {
      if (file) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
        const uuid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
        uploadedPath = `${profile.id}/${uuid}.${ext}`
        const { error: uploadError } = await supabase.storage.from('posts').upload(uploadedPath, file, { contentType: file.type, upsert: false })
        if (uploadError) throw uploadError
      }
      const row = { user_id: profile.id, content: content.trim() || ' ', privacy, media_type: file ? 'image' : 'none', media_urls: uploadedPath ? [uploadedPath] : [] }
      const { error } = await supabase.from('posts').insert(row)
      if (error) throw error
      setContent(''); setFile(null); if (inputRef.current) inputRef.current.value = ''
      notify('تم نشر المنشور.', 'success')
      await onCreated()
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('posts').remove([uploadedPath])
      notify(shortError(error), 'error')
    } finally { setBusy(false) }
  }
  return <form className="panel composer" onSubmit={submit}>
    <div className="composer-top"><Avatar profile={profile} /><textarea aria-label="اكتب منشورًا" value={content} onChange={(e) => setContent(e.target.value)} placeholder="هتونسنا النهارده؟" maxLength={5000} rows={3} /></div>
    {file && <div className="file-chip">الصورة: {file.name}<button type="button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = '' }} aria-label="إزالة الصورة">×</button></div>}
    <div className="composer-footer"><div className="composer-options">
      <button type="button" className="subtle-button" onClick={() => inputRef.current?.click()}>＋ صورة</button>
      <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <label className="privacy-select"><span>الخصوصية</span><select value={privacy} onChange={(e) => setPrivacy(e.target.value)}><option value="public">عام</option><option value="friends">الأصدقاء</option><option value="friends_of_friends">أصدقاء الأصدقاء</option><option value="public_except_friends">عام إلا الأصدقاء</option><option value="only_me">أنا فقط</option></select></label>
    </div><button className="button primary compact" disabled={busy || (!content.trim() && !file)}>{busy ? 'جارٍ النشر…' : 'نشر'}</button></div>
  </form>
}

function PostItem({ post, viewerId, onLike, onSave, onRepost, onComment, onDelete, onEdit, onReport, onBlock, notify }) {
  const [busy, setBusy] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [mediaSrc, setMediaSrc] = useState('')
  const path = post.media_urls?.[0]
  useEffect(() => {
    let active = true
    if (!path) { setMediaSrc(''); return undefined }
    if (/^https?:\/\//i.test(path)) { setMediaSrc(path); return undefined }
    supabase.storage.from('posts').createSignedUrl(path, 3600).then(({ data }) => { if (active) setMediaSrc(data?.signedUrl || '') })
    return () => { active = false }
  }, [path])
  const own = post.user_id === viewerId
  const profile = post.profile || {}
  const act = async (fn) => { if (busy) return; setBusy(true); try { await fn() } finally { setBusy(false) } }
  const share = async () => {
    const url = `${PUBLIC_APP_URL}/?post=${encodeURIComponent(post.id)}`
    try {
      if (navigator.share) await navigator.share({ title: `منشور من ${profile.display_name || profile.username}`, url })
      else { await navigator.clipboard.writeText(url); notify('تم نسخ رابط المنشور.', 'success') }
    } catch (error) { if (error.name !== 'AbortError') notify('تعذرت المشاركة من هذا الجهاز.', 'error') }
  }
  return <article id={`post-${post.id}`} className="panel post-item">
    <div className="post-head"><Avatar profile={profile} /><div className="post-author"><strong>{profile.display_name || profile.username || 'مستخدم'}</strong><span dir="ltr">@{profile.username || 'user'} · {timeAgo(post.created_at)}</span></div>
      <div className="post-menu-wrap"><button className="icon-button" title="خيارات المنشور" aria-expanded={showMenu} onClick={() => setShowMenu((v) => !v)}>⋯</button>
        {showMenu && <div className="account-menu post-menu">{own
          ? <><button onClick={() => { setShowMenu(false); onEdit(post) }}>تعديل نص المنشور</button><button className="danger-text" onClick={() => { setShowMenu(false); act(() => onDelete(post)) }}>حذف المنشور</button></>
          : <><button onClick={() => { setShowMenu(false); onReport(post) }}>إبلاغ عن المنشور</button><button className="danger-text" onClick={() => { setShowMenu(false); onBlock(post) }}>حظر صاحب المنشور</button></>}
        </div>}
      </div>
    </div>
    {post.content?.trim() && <p className="post-content">{post.content}</p>}
    {mediaSrc && <img className="post-media" src={mediaSrc} alt="مرفق المنشور" loading="lazy" />}
    <div className="post-stats"><span>{post.likes_count || 0} إعجاب</span><button onClick={() => onComment(post)}>{post.comments_count || 0} تعليق</button></div>
    <div className="post-actions">
      <button className={post.liked ? 'action active' : 'action'} disabled={busy} onClick={() => act(() => onLike(post))}>{post.liked ? '♥ أعجبني' : '♡ إعجاب'}</button>
      <button className="action" onClick={() => onComment(post)}>تعليق</button>
      <button className={post.reposted ? 'action active' : 'action'} disabled={busy} onClick={() => act(() => onRepost(post))}>{post.reposted ? 'أُعيد نشره' : `إعادة نشر ${post.reposts_count || 0}`}</button>
      <button className={post.saved ? 'action active' : 'action'} disabled={busy} onClick={() => act(() => onSave(post))}>{post.saved ? 'محفوظ' : 'حفظ'}</button>
      <button className="action" onClick={share}>مشاركة</button>
    </div>
  </article>
}

function CommentsDialog({ post, viewer, onClose, notify }) {
  const [comments, setComments] = useState([])
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('comments').select('id,user_id,content,created_at').eq('post_id', post.id).order('created_at', { ascending: true }).limit(100)
    if (error) notify(shortError(error), 'error')
    const ids = [...new Set((data || []).map((c) => c.user_id))]
    const profiles = ids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id', ids) : { data: [] }
    const byId = Object.fromEntries((profiles.data || []).map((p) => [p.id, p]))
    setComments((data || []).map((c) => ({ ...c, profile: byId[c.user_id] })))
    setLoading(false)
  }, [post.id, notify])
  useEffect(() => { load() }, [load])
  const submit = async (event) => {
    event.preventDefault()
    if (!content.trim()) return
    setBusy(true)
    const { error } = await supabase.from('comments').insert({ post_id: post.id, user_id: viewer.id, content: content.trim() })
    setBusy(false)
    if (error) { notify(shortError(error), 'error'); return }
    setContent(''); await load()
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section className="panel modal" role="dialog" aria-modal="true" aria-label="التعليقات">
    <div className="modal-title"><h2>التعليقات</h2><button className="icon-button" onClick={onClose} aria-label="إغلاق">×</button></div>
    <div className="comment-list">{loading ? <p className="muted">جارٍ تحميل التعليقات…</p> : comments.length ? comments.map((c) => <div className="comment" key={c.id}><Avatar profile={c.profile} size="sm" /><div><strong>{c.profile?.display_name || c.profile?.username || 'مستخدم'}</strong><p>{c.content}</p></div></div>) : <p className="muted empty-state">لا توجد تعليقات بعد.</p>}</div>
    <form className="comment-form" onSubmit={submit}><input value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} placeholder="اكتب تعليقًا…" /><button className="button primary compact" disabled={busy || !content.trim()}>{busy ? '…' : 'إرسال'}</button></form>
  </section></div>
}

function SearchPanel({ viewer, notify }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [pending, setPending] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const search = async (event) => {
    event?.preventDefault()
    const q = query.trim().replace(/^@/, '')
    if (q.length < 2) { setResults([]); return }
    setBusy(true)
    const { data, error } = await supabase.from('profiles').select(PROFILE_FIELDS).ilike('username', `%${q}%`).neq('id', viewer.id).limit(20)
    setBusy(false)
    if (error) notify(shortError(error), 'error')
    setResults(data || [])
    if (data?.length) {
      const { data: sent } = await supabase.from('friend_requests').select('to_user').eq('from_user', viewer.id).eq('status', 'pending').in('to_user', data.map((p) => p.id))
      setPending(new Set((sent || []).map((r) => r.to_user)))
    }
  }
  const send = async (person) => {
    const { error } = await supabase.from('friend_requests').insert({ from_user: viewer.id, to_user: person.id, status: 'pending' })
    if (error) notify(shortError(error), 'error')
    else { setPending((p) => new Set([...p, person.id])); notify('تم إرسال طلب الصداقة.', 'success') }
  }
  return <section className="panel section-panel"><h2>ابحث عن أشخاص</h2><form className="search-form" onSubmit={search}><input dir="ltr" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اسم المستخدم" /><button className="button primary compact" disabled={busy}>{busy ? 'بحث…' : 'بحث'}</button></form>
    <div className="people-list">{results.map((person) => <div className="person-row" key={person.id}><Avatar profile={person} /><div className="person-info"><strong>{person.display_name || person.username}</strong><span dir="ltr">@{person.username}</span></div><button className="button secondary compact" disabled={pending.has(person.id)} onClick={() => send(person)}>{pending.has(person.id) ? 'تم الإرسال' : 'إضافة صديق'}</button></div>)}</div>
  </section>
}

function FriendsPanel({ viewer, notify }) {
  const [requests, setRequests] = useState([])
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    const [reqRes, friendRes] = await Promise.all([
      supabase.from('friend_requests').select('id,from_user,created_at').eq('to_user', viewer.id).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('friends').select('user_a,user_b').or(`user_a.eq.${viewer.id},user_b.eq.${viewer.id}`),
    ])
    if (reqRes.error) notify(shortError(reqRes.error), 'error')
    if (friendRes.error) notify(shortError(friendRes.error), 'error')
    const requestIds = (reqRes.data || []).map((r) => r.from_user)
    const friendIds = (friendRes.data || []).map((r) => r.user_a === viewer.id ? r.user_b : r.user_a)
    const allIds = [...new Set([...requestIds, ...friendIds])]
    const peopleRes = allIds.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id', allIds) : { data: [] }
    const map = Object.fromEntries((peopleRes.data || []).map((p) => [p.id, p]))
    setRequests((reqRes.data || []).map((r) => ({ ...r, profile: map[r.from_user] })))
    setFriends(friendIds.map((id) => map[id]).filter(Boolean))
    setLoading(false)
  }, [viewer.id, notify])
  useEffect(() => { load() }, [load])
  const accept = async (requestId) => {
    const { error } = await supabase.rpc('accept_friend_request', { request_id: requestId })
    if (error) notify(shortError(error), 'error'); else { notify('تم قبول طلب الصداقة.', 'success'); load() }
  }
  const decline = async (requestId) => {
    const { error } = await supabase.from('friend_requests').update({ status: 'declined' }).eq('id', requestId)
    if (error) notify(shortError(error), 'error'); else load()
  }
  const remove = async (person) => {
    const [low, high] = [viewer.id, person.id].sort()
    const { error } = await supabase.from('friends').delete().eq('user_a', low).eq('user_b', high)
    if (error) notify(shortError(error), 'error'); else load()
  }
  return <section className="panel section-panel"><h2>الأصدقاء</h2>{loading ? <p className="muted">جارٍ التحميل…</p> : <>
    <h3>طلبات واردة <span className="count-pill">{requests.length}</span></h3>
    {!requests.length && <p className="muted">لا توجد طلبات جديدة.</p>}
    {requests.map((r) => <div className="person-row" key={r.id}><Avatar profile={r.profile} /><div className="person-info"><strong>{r.profile?.display_name || r.profile?.username || 'مستخدم'}</strong><span>يريد إضافتك صديقًا</span></div><button className="button primary compact" onClick={() => accept(r.id)}>قبول</button><button className="button secondary compact" onClick={() => decline(r.id)}>رفض</button></div>)}
    <h3 className="spaced-heading">قائمة الأصدقاء <span className="count-pill">{friends.length}</span></h3>
    {!friends.length && <p className="muted">لم تضف أصدقاء بعد. ابحث عن أشخاص لإضافتهم.</p>}
    {friends.map((p) => <div className="person-row" key={p.id}><Avatar profile={p} /><div className="person-info"><strong>{p.display_name || p.username}</strong><span dir="ltr">@{p.username}</span></div><button className="button secondary compact" onClick={() => remove(p)}>إزالة</button></div>)}
  </>}</section>
}

function ProfilePanel({ profile, viewerId, onSaved, onNavigate, notify }) {
  const [name, setName] = useState(profile.display_name || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setName(profile.display_name || ''); setBio(profile.bio || '') }, [profile.id, profile.display_name, profile.bio])
  const save = async (event) => {
    event.preventDefault(); setBusy(true)
    const { error } = await supabase.from('profiles').update({ display_name: name.trim(), bio: bio.trim(), updated_at: new Date().toISOString() }).eq('id', viewerId)
    setBusy(false)
    if (error) notify(shortError(error), 'error'); else { notify('تم تحديث الملف الشخصي.', 'success'); await onSaved() }
  }
  return <section className="panel section-panel profile-panel"><div className="profile-shortcuts"><button className="button secondary compact" onClick={() => onNavigate('friends')}>الأصدقاء</button><button className="button secondary compact" onClick={() => onNavigate('saved')}>المحفوظات</button></div><div className="profile-summary"><Avatar profile={profile} size="lg" /><div><h2>{profile.display_name || profile.username}</h2><p dir="ltr">@{profile.username}</p></div></div>
    <form className="form-stack" onSubmit={save}><label>اسم العرض<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label><label>نبذة عنك<textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3} /></label><button className="button primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</button></form>
  </section>
}

export default function App({ session, onSignOut, onDeleteAccount }) {
  const viewerId = session.user.id
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [savedPosts, setSavedPosts] = useState([])
  const [tab, setTab] = useState('home')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(null)
  const [commentsPost, setCommentsPost] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const timerRef = useRef(null)
  const notify = useCallback((text, type = 'info') => {
    setNotice({ text, type })
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setNotice(null), 4200)
  }, [])
  const loadProfile = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select(PROFILE_FIELDS).eq('id', viewerId).maybeSingle()
    if (error) notify(shortError(error), 'error')
    if (!data) {
      const fallbackUsername = session.user.user_metadata?.username || `user_${viewerId.replaceAll('-', '').slice(0, 10)}`
      notify('لم يُنشأ ملفك تلقائيًا. راجع تشغيل schema.sql ووجود المشغّل on_auth_user_created.', 'error')
      setProfile({ id: viewerId, username: fallbackUsername, display_name: session.user.user_metadata?.display_name || fallbackUsername })
    } else setProfile(data)
  }, [viewerId, session.user.user_metadata, notify])
  const loadFeed = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('posts').select(POST_FIELDS).order('created_at', { ascending: false }).limit(50)
    if (error) { notify(shortError(error), 'error'); setPosts([]); setLoading(false); return }
    const rows = data || []
    const sharedId = new URLSearchParams(window.location.search).get('post')
    if (sharedId && !rows.some((row) => row.id === sharedId)) {
      const { data: sharedPost } = await supabase.from('posts').select(POST_FIELDS).eq('id', sharedId).maybeSingle()
      if (sharedPost) rows.unshift(sharedPost)
    }
    const authorIds = [...new Set(rows.map((r) => r.user_id))]
    const postIds = rows.map((r) => r.id)
    const [peopleRes, likesRes, savesRes, repostsRes] = await Promise.all([
      authorIds.length ? supabase.from('profiles').select(PROFILE_FIELDS).in('id', authorIds) : Promise.resolve({ data: [] }),
      postIds.length ? supabase.from('likes').select('post_id').eq('user_id', viewerId).in('post_id', postIds) : Promise.resolve({ data: [] }),
      postIds.length ? supabase.from('saves').select('post_id').eq('user_id', viewerId).in('post_id', postIds) : Promise.resolve({ data: [] }),
      postIds.length ? supabase.from('reposts').select('post_id').eq('user_id', viewerId).in('post_id', postIds) : Promise.resolve({ data: [] }),
    ])
    if (peopleRes.error || likesRes.error || savesRes.error || repostsRes.error) notify(shortError(peopleRes.error || likesRes.error || savesRes.error || repostsRes.error), 'error')
    const people = Object.fromEntries((peopleRes.data || []).map((p) => [p.id, p]))
    const liked = new Set((likesRes.data || []).map((r) => r.post_id))
    const saved = new Set((savesRes.data || []).map((r) => r.post_id))
    const reposted = new Set((repostsRes.data || []).map((r) => r.post_id))
    setPosts(rows.map((r) => ({ ...r, profile: people[r.user_id], liked: liked.has(r.id), saved: saved.has(r.id), reposted: reposted.has(r.id) })))
    setLoading(false)
  }, [viewerId, notify])
  const loadSaved = useCallback(async () => {
    const { data, error } = await supabase.from('saves').select('post_id,posts(*)').eq('user_id', viewerId).order('created_at', { ascending: false }).limit(50)
    if (error) { notify(shortError(error), 'error'); setSavedPosts([]); return }
    const rows = (data || []).map((r) => r.posts).filter(Boolean)
    const ids = [...new Set(rows.map((r) => r.user_id))]
    const postIds = rows.map((r) => r.id)
    const [peopleRes, likesRes, repostsRes] = await Promise.all([
      ids.length ? supabase.from('profiles').select(PROFILE_FIELDS).in('id', ids) : Promise.resolve({ data: [] }),
      postIds.length ? supabase.from('likes').select('post_id').eq('user_id', viewerId).in('post_id', postIds) : Promise.resolve({ data: [] }),
      postIds.length ? supabase.from('reposts').select('post_id').eq('user_id', viewerId).in('post_id', postIds) : Promise.resolve({ data: [] }),
    ])
    const people = Object.fromEntries((peopleRes.data || []).map((p) => [p.id, p]))
    const liked = new Set((likesRes.data || []).map((r) => r.post_id))
    const reposted = new Set((repostsRes.data || []).map((r) => r.post_id))
    setSavedPosts(rows.map((r) => ({ ...r, profile: people[r.user_id], saved: true, liked: liked.has(r.id), reposted: reposted.has(r.id) })))
  }, [viewerId, notify])

  useEffect(() => { loadProfile() }, [loadProfile])
  useEffect(() => { loadFeed() }, [loadFeed, refreshKey])
  useEffect(() => { if (tab === 'saved') loadSaved() }, [tab, loadSaved, refreshKey])
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get('post')
    if (target && posts.some((post) => post.id === target)) window.setTimeout(() => document.getElementById(`post-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }, [posts])
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const postsByMe = useMemo(() => posts.filter((p) => p.user_id === viewerId), [posts, viewerId])
  const toggleLike = async (post) => {
    const next = !post.liked
    const update = (items) => items.map((p) => p.id === post.id ? { ...p, liked: next, likes_count: Math.max(0, (p.likes_count || 0) + (next ? 1 : -1)) } : p)
    setPosts(update)
    setSavedPosts(update)
    const result = next ? await supabase.from('likes').insert({ user_id: viewerId, post_id: post.id }) : await supabase.from('likes').delete().eq('user_id', viewerId).eq('post_id', post.id)
    if (result.error) { notify(shortError(result.error), 'error'); setRefreshKey((v) => v + 1) }
  }
  const toggleRepost = async (post) => {
    const next = !post.reposted
    const update = (items) => items.map((p) => p.id === post.id ? { ...p, reposted: next, reposts_count: Math.max(0, (p.reposts_count || 0) + (next ? 1 : -1)) } : p)
    setPosts(update); setSavedPosts(update)
    const result = next ? await supabase.from('reposts').insert({ user_id: viewerId, post_id: post.id }) : await supabase.from('reposts').delete().eq('user_id', viewerId).eq('post_id', post.id)
    if (result.error) { notify(shortError(result.error), 'error'); setRefreshKey((v) => v + 1) }
    else notify(next ? 'تمت إعادة النشر.' : 'تم إلغاء إعادة النشر.', 'success')
  }
  const editPost = async (post) => {
    const content = window.prompt('عدّل نص المنشور:', post.content || '')
    if (content === null || !content.trim()) return
    const { error } = await supabase.from('posts').update({ content: content.trim().slice(0, 5000), is_edited: true, edited_at: new Date().toISOString() }).eq('id', post.id).eq('user_id', viewerId)
    if (error) notify(shortError(error), 'error'); else { notify('تم تعديل المنشور.', 'success'); setRefreshKey((v) => v + 1) }
  }
  const toggleSave = async (post) => {
    const result = post.saved ? await supabase.from('saves').delete().eq('user_id', viewerId).eq('post_id', post.id) : await supabase.from('saves').insert({ user_id: viewerId, post_id: post.id })
    if (result.error) notify(shortError(result.error), 'error')
    else { notify(post.saved ? 'أُزيل المنشور من المحفوظات.' : 'تم حفظ المنشور.', 'success'); setRefreshKey((v) => v + 1) }
  }
  const deletePost = async (post) => {
    if (!window.confirm('هل تريد حذف هذا المنشور نهائيًا؟')) return
    const { error } = await supabase.from('posts').delete().eq('id', post.id).eq('user_id', viewerId)
    if (error) notify(shortError(error), 'error'); else {
      const paths = (post.media_urls || []).filter((path) => path && !/^https?:\/\//i.test(path))
      if (paths.length) { const { error: mediaError } = await supabase.storage.from('posts').remove(paths); if (mediaError) notify(`حُذف المنشور لكن تعذر حذف الصورة: ${shortError(mediaError)}`, 'error') }
      notify('تم حذف المنشور.', 'success'); setRefreshKey((v) => v + 1)
    }
  }
  const refreshProfile = async () => { await loadProfile(); setRefreshKey((v) => v + 1) }
  const reportPost = async (post) => {
    const reason = window.prompt('اكتب سبب الإبلاغ (حتى 500 حرف):')
    if (!reason?.trim()) return
    const { error } = await supabase.from('reports').insert({ reporter_id: viewerId, reported_post_id: post.id, reported_user_id: post.user_id, reason: reason.trim().slice(0, 500), type: 'post' })
    if (error) notify(shortError(error), 'error'); else notify('تم إرسال البلاغ للمراجعة.', 'success')
  }
  const blockUser = async (post) => {
    if (post.user_id === viewerId || !window.confirm('حظر هذا المستخدم؟ لن تظهر لك منشوراته بعد ذلك.')) return
    const { error } = await supabase.from('blocks').insert({ blocker_id: viewerId, blocked_id: post.user_id })
    if (error) notify(shortError(error), 'error'); else { notify('تم حظر المستخدم.', 'success'); setRefreshKey((v) => v + 1) }
  }
  const visiblePosts = tab === 'saved' ? savedPosts : tab === 'profile' ? postsByMe : posts

  return <div className="app-shell" dir="rtl">
    <AppHeader profile={profile} onSignOut={onSignOut} onDeleteAccount={onDeleteAccount} />
    <main className="main-content">
      <div className="page-heading"><div><p className="eyebrow">مساحة الونس</p><h1>{tab === 'home' ? 'آخر المنشورات' : tab === 'search' ? 'اكتشف' : tab === 'friends' ? 'مجتمعك' : tab === 'saved' ? 'المحفوظات' : tab === 'messages' ? 'الرسائل' : tab === 'notifications' ? 'التنبيهات' : 'ملفي الشخصي'}</h1></div><button className="icon-button refresh-button" title="تحديث" onClick={() => setRefreshKey((v) => v + 1)}>↻</button></div>
      {notice && <div className={`toast ${notice.type}`} role="status">{notice.text}<button onClick={() => setNotice(null)} aria-label="إغلاق">×</button></div>}
      {tab === 'home' && profile && <Composer profile={profile} onCreated={() => setRefreshKey((v) => v + 1)} notify={notify} />}
      {tab === 'search' && <SearchPanel viewer={session.user} notify={notify} />}
      {tab === 'friends' && <FriendsPanel viewer={session.user} notify={notify} />}
      {tab === 'messages' && <MessagesPanel viewer={session.user} notify={notify} />}
      {tab === 'notifications' && <NotificationsPanel viewer={session.user} notify={notify} />}
      {tab === 'profile' && profile && <ProfilePanel profile={profile} viewerId={viewerId} onSaved={refreshProfile} onNavigate={setTab} notify={notify} />}
      {['home', 'saved', 'profile'].includes(tab) && <section className="feed-list" aria-live="polite">
        {loading && tab !== 'saved' ? <div className="panel empty-state">جارٍ تحميل المنشورات…</div> : !visiblePosts.length ? <div className="panel empty-state">{tab === 'saved' ? 'لا توجد منشورات محفوظة.' : tab === 'profile' ? 'لم تنشر شيئًا بعد.' : 'لا توجد منشورات بعد. كن أول من يشارك.'}</div> : visiblePosts.map((post) => <PostItem key={`${tab}-${post.id}`} post={post} viewerId={viewerId} onLike={toggleLike} onSave={toggleSave} onRepost={toggleRepost} onComment={setCommentsPost} onDelete={deletePost} onEdit={editPost} onReport={reportPost} onBlock={blockUser} notify={notify} />)}
      </section>}
    </main>
    <nav className="bottom-nav" aria-label="التنقل الرئيسي">
      {[['home', 'الرئيسية', '⌂'], ['search', 'اكتشف', '⌕'], ['messages', 'الرسائل', '✉'], ['notifications', 'تنبيهات', '♧'], ['profile', 'حسابي', '◉']].map(([id, label, icon]) => <button key={id} className={tab === id ? 'nav-item selected' : 'nav-item'} onClick={() => setTab(id)}><span aria-hidden="true">{icon}</span><small>{label}</small></button>)}
    </nav>
    {commentsPost && <CommentsDialog post={commentsPost} viewer={session.user} onClose={() => setCommentsPost(null)} notify={notify} />}
  </div>
}
