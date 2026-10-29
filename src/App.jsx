import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './utils/supabase.js'
import MessagesPanel from './components/MessagesPanel.jsx'
import NotificationsPanel from './components/NotificationsPanel.jsx'

const PROFILE_FIELDS = 'id,username,display_name,bio,avatar_url,cover_url,is_verified,created_at'
const POST_FIELDS = 'id,user_id,content,media_urls,media_type,privacy,hidden_from,comment_setting,is_archived,is_edited,edited_at,created_at,likes_count,comments_count,reposts_count,shares_count,saves_count'
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

const PRIVACY_LABELS = {
  public: '🌐 عام',
  friends: '👥 الأصدقاء',
  friends_of_friends: '🔗 أصدقاء الأصدقاء',
  public_except_friends: '🚫 عام إلا الأصدقاء',
  only_me: '🔒 أنا فقط',
}

const COMMENT_LABELS = {
  everyone: '💬 الجميع',
  friends: '👥 الأصدقاء فقط',
  mentioned_only: '🏷️ المذكورون فقط',
  none: '🔇 لا أحد',
}

function Avatar({ profile, size = 'md' }) {
  const name = profile?.display_name || profile?.username || 'ونس'
  return profile?.avatar_url
    ? <img className={`avatar avatar-${size}`} src={profile.avatar_url} alt={name} loading="lazy" />
    : <span className={`avatar avatar-${size} avatar-fallback`} aria-label={name}>{initials(name)}</span>
}

function AppHeader({ profile, quietMode, onToggleQuiet, setTab }) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-lockup" onClick={() => setTab('home')} style={{ cursor: 'pointer' }}>
          <div className="brand-mark">و</div>
          <span>WANAS</span>
        </div>
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="subtle-button"
            aria-label="الوضع الهادئ"
            onClick={onToggleQuiet}
            style={{
              background: quietMode ? '#065f46' : '#102a22',
              color: '#5eead4',
              padding: '5px 11px',
              borderRadius: '20px',
              fontSize: '11px',
              border: quietMode ? '1px solid #34d399' : '1px solid transparent',
            }}
          >
            🌿 {quietMode ? 'هادئ (مفعل)' : 'هادئ'}
          </button>
          <button type="button" className="icon-button" aria-label="بحث واكتشاف" title="اكتشف" onClick={() => setTab('search')}>
            <span style={{ fontSize: '17px' }}>⌕</span>
          </button>
          <button type="button" className="icon-button" aria-label="التنبيهات" title="التنبيهات" onClick={() => setTab('notifications')}>
            <span style={{ fontSize: '16px' }}>🔔</span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="ملفي الشخصي"
            title="ملفي الشخصي"
            onClick={() => setTab('profile')}
            style={{ padding: 0, overflow: 'hidden' }}
          >
            <Avatar profile={profile} size="sm" />
          </button>
        </div>
      </div>
    </header>
  )
}

function StoryRail({ viewerId, profile, notify }) {
  const [stories, setStories] = useState([])
  const [activeStory, setActiveStory] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const loadStories = useCallback(async () => {
    const { data, error } = await supabase
      .from('stories')
      .select('id,user_id,media_url,media_type,expires_at,viewers,created_at')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) return
    const uids = [...new Set((data || []).map((s) => s.user_id))]
    const profRes = uids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id', uids) : { data: [] }
    const map = Object.fromEntries((profRes.data || []).map((p) => [p.id, p]))
    setStories((data || []).map((s) => ({ ...s, profile: map[s.user_id] })))
  }, [])

  useEffect(() => { loadStories() }, [loadStories])

  const uploadStory = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      notify('اختر صورة للقصة لا تتجاوز 10 ميجابايت.', 'error')
      return
    }
    setBusy(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const uuid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`
      const path = `${viewerId}/story_${uuid}.${ext}`
      const { error: upErr } = await supabase.storage.from('posts').upload(path, file, { contentType: file.type })
      if (upErr) throw upErr
      const { data: signed } = await supabase.storage.from('posts').createSignedUrl(path, 86400)
      const mediaUrl = signed?.signedUrl || path
      const { error } = await supabase.from('stories').insert({ user_id: viewerId, media_url: mediaUrl, media_type: 'image' })
      if (error) throw error
      notify('تم نشر قصتك لمدة 24 ساعة.', 'success')
      await loadStories()
    } catch (err) {
      notify(shortError(err), 'error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const deleteStory = async (story) => {
    if (!window.confirm('حذف هذه القصة؟')) return
    const { error } = await supabase.from('stories').delete().eq('id', story.id).eq('user_id', viewerId)
    if (error) notify(shortError(error), 'error')
    else {
      notify('تم حذف القصة.', 'success')
      setActiveStory(null)
      loadStories()
    }
  }

  return (
    <div className="stories-bar panel" style={{ padding: '12px', marginBottom: '14px', overflowX: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
      <input ref={fileRef} type="file" accept="image/*" className="visually-hidden" onChange={uploadStory} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'none', border: 0, color: '#fff', minWidth: '64px' }}
      >
        <div style={{ position: 'relative' }}>
          <Avatar profile={profile} size="md" />
          <span style={{ position: 'absolute', bottom: -2, left: -2, background: '#10b981', color: '#000', borderRadius: '50%', width: '18px', height: '18px', display: 'grid', placeItems: 'center', fontSize: '13px', fontWeight: 'bold' }}>+</span>
        </div>
        <small style={{ fontSize: '11px', color: '#ccc' }}>{busy ? 'جارٍ الرفع…' : 'قصتي +'}</small>
      </button>

      {stories.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => setActiveStory(s)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'none', border: 0, color: '#fff', minWidth: '64px' }}
        >
          <div style={{ padding: '2px', borderRadius: '50%', border: '2px solid #34d399' }}>
            <Avatar profile={s.profile} size="md" />
          </div>
          <small style={{ fontSize: '11px', color: '#ccc', maxWidth: '64px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.profile?.display_name || s.profile?.username || 'مستخدم'}
          </small>
        </button>
      ))}

      {activeStory && (
        <div className="modal-backdrop" onClick={() => setActiveStory(null)}>
          <div className="panel modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', gap: '12px' }}>
            <div className="modal-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Avatar profile={activeStory.profile} size="sm" />
                <strong>{activeStory.profile?.display_name || activeStory.profile?.username}</strong>
                <small className="muted">{timeAgo(activeStory.created_at)}</small>
              </div>
              <button className="icon-button" onClick={() => setActiveStory(null)}>×</button>
            </div>
            <img src={activeStory.media_url} alt="قصة" style={{ maxHeight: '60dvh', width: '100%', objectFit: 'contain', borderRadius: '12px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
              <span className="muted">👁️ المشاهدات: {activeStory.viewers?.length || 0}</span>
              {activeStory.user_id === viewerId && (
                <button className="button secondary compact danger-text" onClick={() => deleteStory(activeStory)}>🗑️ حذف القصة</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Composer({ profile, defaultPrivacy, onCreated, notify }) {
  const [content, setContent] = useState('')
  const [privacy, setPrivacy] = useState(defaultPrivacy || 'public')
  const [commentSetting, setCommentSetting] = useState('everyone')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  const submit = async (event) => {
    event.preventDefault()
    if (!content.trim() && !file) return
    if (content.length > 5000) return notify('المنشور أطول من الحد المسموح (5000 حرف).', 'error')
    if (file && (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024)) {
      return notify('اختر صورة لا يتجاوز حجمها 10 ميجابايت.', 'error')
    }
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
      const row = {
        user_id: profile.id,
        content: content.trim() || ' ',
        privacy,
        comment_setting: commentSetting,
        media_type: file ? 'image' : 'none',
        media_urls: uploadedPath ? [uploadedPath] : [],
      }
      const { error } = await supabase.from('posts').insert(row)
      if (error) throw error
      setContent('')
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      notify('تم نشر المنشور بنجاح.', 'success')
      await onCreated()
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('posts').remove([uploadedPath])
      notify(shortError(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const addLink = () => {
    const url = window.prompt('أدخل الرابط (يجب أن يبدأ بـ https://):', 'https://')
    if (!url || url === 'https://') return
    if (!/^https:\/\//i.test(url.trim())) return notify('الروابط الخارجية يجب أن تكون https آمنة.', 'error')
    setContent((prev) => `${prev ? prev + '\n' : ''}${url.trim()}`)
  }

  return (
    <form className="panel composer" onSubmit={submit}>
      <div className="composer-top">
        <Avatar profile={profile} />
        <textarea
          aria-label="اكتب منشورًا"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="هتونسنا النهاردة؟ شاركنا اللي في بالك..."
          maxLength={5000}
          rows={3}
        />
      </div>
      {content.length > 0 && (
        <div style={{ textAlign: 'left', fontSize: '11px', color: '#777', marginTop: '4px' }}>
          {content.length} / 5000
        </div>
      )}
      {file && (
        <div className="file-chip">
          <span>🖼️ المرفق: {file.name}</span>
          <button type="button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = '' }} aria-label="إزالة الصورة">×</button>
        </div>
      )}
      {showAdvanced && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px', padding: '10px', background: '#080808', borderRadius: '12px', border: '1px solid #1a1a1a' }}>
          <label className="privacy-select">
            <span>الجمهور:</span>
            <select value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
              <option value="public">🌐 عام</option>
              <option value="friends">👥 الأصدقاء</option>
              <option value="friends_of_friends">🔗 أصدقاء الأصدقاء</option>
              <option value="public_except_friends">🚫 عام إلا الأصدقاء</option>
              <option value="only_me">🔒 أنا فقط</option>
            </select>
          </label>
          <label className="privacy-select">
            <span>التعليقات:</span>
            <select value={commentSetting} onChange={(e) => setCommentSetting(e.target.value)}>
              <option value="everyone">💬 الجميع</option>
              <option value="friends">👥 الأصدقاء</option>
              <option value="mentioned_only">🏷️ المذكورون فقط</option>
              <option value="none">🔇 لا أحد</option>
            </select>
          </label>
          <button type="button" className="subtle-button" onClick={addLink} style={{ fontSize: '12px' }}>🔗 إرفاق رابط https</button>
        </div>
      )}
      <div className="composer-footer">
        <div className="composer-options" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="subtle-button" onClick={() => inputRef.current?.click()}>🖼️ صورة</button>
          <button type="button" className="subtle-button" onClick={() => notify('رفع الفيديو القصير قيد التجهيز في خطة التخزين.', 'info')}>📹 فيديو</button>
          <button type="button" className="subtle-button" onClick={() => notify('التسجيل الصوتي المباشر قيد التجهيز.', 'info')}>🎙️ صوت</button>
          <button type="button" className="subtle-button" onClick={() => setShowAdvanced((v) => !v)}>+ المزيد</button>
          <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <label className="privacy-select">
            <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} aria-label="خصوصية المنشور">
              <option value="public">🌐 عام</option>
              <option value="friends">👥 الأصدقاء</option>
              <option value="friends_of_friends">🔗 أصدقاء الأصدقاء</option>
              <option value="public_except_friends">🚫 عام إلا الأصدقاء</option>
              <option value="only_me">🔒 أنا فقط</option>
            </select>
          </label>
        </div>
        <button className="button primary compact" disabled={busy || (!content.trim() && !file)}>
          {busy ? 'جارٍ النشر…' : 'نشر'}
        </button>
      </div>
    </form>
  )
}

function PostItem({
  post,
  viewerId,
  onLike,
  onSave,
  onRepost,
  onComment,
  onDelete,
  onEdit,
  onChangePrivacy,
  onChangeCommentSetting,
  onArchive,
  onHidePost,
  onReportPost,
  onReportUser,
  onBlock,
  onOpenProfile,
  onAddFriend,
  onMessageUser,
  notify,
}) {
  const [busy, setBusy] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [mediaSrc, setMediaSrc] = useState('')
  const path = post.media_urls?.[0]

  useEffect(() => {
    let active = true
    if (!path) { setMediaSrc(''); return undefined }
    if (/^https?:\/\//i.test(path)) { setMediaSrc(path); return undefined }
    supabase.storage.from('posts').createSignedUrl(path, 3600).then(({ data }) => {
      if (active) setMediaSrc(data?.signedUrl || '')
    })
    return () => { active = false }
  }, [path])

  const own = post.user_id === viewerId
  const profile = post.profile || {}
  const act = async (fn) => { if (busy) return; setBusy(true); try { await fn() } finally { setBusy(false) } }

  const copyLink = async () => {
    const url = `${PUBLIC_APP_URL}/?post=${encodeURIComponent(post.id)}`
    await navigator.clipboard.writeText(url)
    notify('🔗 تم نسخ رابط المنشور.', 'success')
    setShowMenu(false)
  }

  const share = async () => {
    const url = `${PUBLIC_APP_URL}/?post=${encodeURIComponent(post.id)}`
    try {
      if (navigator.share) await navigator.share({ title: `منشور من ${profile.display_name || profile.username}`, url })
      else { await navigator.clipboard.writeText(url); notify('🔗 تم نسخ رابط المنشور.', 'success') }
    } catch (error) {
      if (error.name !== 'AbortError') notify('تعذرت المشاركة من هذا الجهاز.', 'error')
    }
  }

  return (
    <article id={`post-${post.id}`} className="panel post-item">
      <div className="post-head">
        <div onClick={() => onOpenProfile(profile)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '11px', flex: 1, minWidth: 0 }}>
          <Avatar profile={profile} />
          <div className="post-author">
            <strong>
              {profile.display_name || profile.username || 'مستخدم'}{' '}
              {profile.is_verified && <span title="حساب موثق" style={{ color: '#60a5fa' }}>✓</span>}
            </strong>
            <span dir="ltr">
              @{profile.username || 'user'} · {timeAgo(post.created_at)} · {PRIVACY_LABELS[post.privacy] || '🌐 عام'}
              {post.is_edited ? ' · (معدّل)' : ''}
            </span>
          </div>
        </div>
        <div className="post-menu-wrap">
          <button type="button" className="icon-button" aria-label="خيارات المنشور" aria-expanded={showMenu} onClick={() => setShowMenu((v) => !v)}>⋯</button>
          {showMenu && (
            <div className="account-menu post-menu">
              {own ? (
                <>
                  <button type="button" onClick={() => { setShowMenu(false); onEdit(post) }}>✏️ تعديل المنشور</button>
                  <button type="button" onClick={() => { setShowMenu(false); onChangePrivacy(post) }}>🌐 تغيير الجمهور</button>
                  <button type="button" onClick={() => { setShowMenu(false); onChangeCommentSetting(post) }}>💬 تغيير من يستطيع التعليق</button>
                  <button type="button" onClick={() => { setShowMenu(false); act(() => onArchive(post)) }}>
                    📦 {post.is_archived ? 'إلغاء الأرشفة' : 'أرشفة المنشور'}
                  </button>
                  <button type="button" onClick={() => { setShowMenu(false); act(() => onSave(post)) }}>
                    📖 {post.saved ? 'إزالة من المحفوظات' : 'الحفظ'}
                  </button>
                  <button type="button" onClick={copyLink}>🔗 نسخ الرابط</button>
                  <button type="button" className="danger-text" onClick={() => { setShowMenu(false); act(() => onDelete(post)) }}>🗑️ حذف المنشور</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => { setShowMenu(false); onOpenProfile(profile) }}>👤 فتح الملف الشخصي</button>
                  <button type="button" onClick={() => { setShowMenu(false); onAddFriend(profile) }}>👥 إضافة صديق</button>
                  <button type="button" onClick={() => { setShowMenu(false); onMessageUser(profile) }}>✉️ إرسال رسالة</button>
                  <button type="button" onClick={() => { setShowMenu(false); act(() => onSave(post)) }}>
                    📖 {post.saved ? 'إزالة من المحفوظات' : 'الحفظ'}
                  </button>
                  <button type="button" onClick={copyLink}>🔗 نسخ الرابط</button>
                  <button type="button" onClick={() => { setShowMenu(false); onHidePost(post) }}>🙈 إخفاء هذا المنشور</button>
                  <button type="button" onClick={() => { setShowMenu(false); onReportPost(post) }}>⚠️ الإبلاغ عن المنشور</button>
                  <button type="button" onClick={() => { setShowMenu(false); onReportUser(profile) }}>🚩 الإبلاغ عن صاحب الحساب</button>
                  <button type="button" className="danger-text" onClick={() => { setShowMenu(false); onBlock(post) }}>🚫 حظر المستخدم</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {post.content?.trim() && <p className="post-content">{post.content}</p>}
      {mediaSrc && <img className="post-media" src={mediaSrc} alt="مرفق المنشور" loading="lazy" />}

      <div className="post-stats">
        <span>♥ {post.likes_count || 0} إعجاب · 🔁 {post.reposts_count || 0} إعادة نشر</span>
        <button type="button" onClick={() => onComment(post)}>💬 {post.comments_count || 0} تعليق ({COMMENT_LABELS[post.comment_setting || 'everyone']})</button>
      </div>

      <div className="post-actions">
        <button type="button" className={post.liked ? 'action active' : 'action'} disabled={busy} onClick={() => act(() => onLike(post))}>
          {post.liked ? '♥ أعجبني' : '♡ إعجاب'}
        </button>
        <button type="button" className="action" onClick={() => onComment(post)}>💬 تعليق</button>
        <button type="button" className={post.reposted ? 'action active' : 'action'} disabled={busy} onClick={() => act(() => onRepost(post))}>
          {post.reposted ? '🔁 أُعيد نشره' : '🔁 إعادة نشر'}
        </button>
        <button type="button" className={post.saved ? 'action active' : 'action'} disabled={busy} onClick={() => act(() => onSave(post))}>
          {post.saved ? '📖 محفوظ' : '📖 حفظ'}
        </button>
        <button type="button" className="action" onClick={share}>🔗 مشاركة</button>
      </div>
    </article>
  )
}

function CommentsDialog({ post, viewer, onClose, notify }) {
  const [comments, setComments] = useState([])
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('comments')
      .select('id,user_id,content,parent_id,created_at')
      .eq('post_id', post.id)
      .order('created_at', { ascending: sortAsc })
      .limit(100)
    if (error) notify(shortError(error), 'error')
    const ids = [...new Set((data || []).map((c) => c.user_id))]
    const profiles = ids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id', ids) : { data: [] }
    const byId = Object.fromEntries((profiles.data || []).map((p) => [p.id, p]))
    setComments((data || []).map((c) => ({ ...c, profile: byId[c.user_id] })))
    setLoading(false)
  }, [post.id, sortAsc, notify])

  useEffect(() => { load() }, [load])

  const submit = async (event) => {
    event.preventDefault()
    if (!content.trim()) return
    setBusy(true)
    const payload = { post_id: post.id, user_id: viewer.id, content: content.trim(), parent_id: replyTo?.id || null }
    const { error } = await supabase.from('comments').insert(payload)
    setBusy(false)
    if (error) { notify(shortError(error), 'error'); return }
    setContent('')
    setReplyTo(null)
    await load()
  }

  const deleteComment = async (c) => {
    if (!window.confirm('حذف هذا التعليق؟')) return
    const { error } = await supabase.from('comments').delete().eq('id', c.id).eq('user_id', viewer.id)
    if (error) notify(shortError(error), 'error')
    else load()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="panel modal" role="dialog" aria-modal="true" aria-label="التعليقات">
        <div className="modal-title">
          <h2>💬 التعليقات ({comments.length})</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className="subtle-button" onClick={() => setSortAsc((v) => !v)}>
              {sortAsc ? 'الأقدم أولاً ⬆️' : 'الأحدث أولاً ⬇️'}
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="إغلاق">×</button>
          </div>
        </div>
        <div className="comment-list">
          {loading ? (
            <p className="muted">جارٍ تحميل التعليقات…</p>
          ) : comments.length ? (
            comments.map((c) => (
              <div className="comment" key={c.id} style={{ marginRight: c.parent_id ? '24px' : 0 }}>
                <Avatar profile={c.profile} size="sm" />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{c.profile?.display_name || c.profile?.username || 'مستخدم'}</strong>
                    <small className="muted" style={{ fontSize: '10px' }}>{timeAgo(c.created_at)}</small>
                  </div>
                  <p>{c.content}</p>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '11px' }}>
                    <button type="button" className="subtle-button" onClick={() => setReplyTo(c)} style={{ padding: 0 }}>↩️ رد</button>
                    {c.user_id === viewer.id && (
                      <button type="button" className="subtle-button danger-text" onClick={() => deleteComment(c)} style={{ padding: 0 }}>🗑️ حذف</button>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="muted empty-state">لا توجد تعليقات بعد.</p>
          )}
        </div>
        {replyTo && (
          <div className="file-chip" style={{ margin: '4px 0' }}>
            <span>الرد على: {replyTo.profile?.display_name || replyTo.profile?.username}</span>
            <button type="button" onClick={() => setReplyTo(null)}>×</button>
          </div>
        )}
        <form className="comment-form" onSubmit={submit}>
          <input value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} placeholder="اكتب تعليقًا…" />
          <button type="button" className="icon-button" title="تعليق صوتي قريباً" onClick={() => notify('التعليق الصوتي قيد التجهيز.', 'info')}>🎙️</button>
          <button className="button primary compact" disabled={busy || !content.trim()}>{busy ? '…' : 'إرسال'}</button>
        </form>
      </section>
    </div>
  )
}

function DiscoverPanel({ viewer, posts, onOpenProfile, notify }) {
  const [subTab, setSubTab] = useState('people')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [tags, setTags] = useState([])
  const [pending, setPending] = useState(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('hashtags').select('id,tag,posts_count').order('posts_count', { ascending: false }).limit(20).then(({ data }) => {
      setTags(data || [])
    })
  }, [])

  const search = async (event) => {
    event?.preventDefault()
    const q = query.trim().replace(/^[@#]/, '')
    if (q.length < 2) { setResults([]); return }
    setBusy(true)
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_FIELDS)
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq('id', viewer.id)
      .limit(20)
    setBusy(false)
    if (error) notify(shortError(error), 'error')
    setResults(data || [])
    if (data?.length) {
      const { data: sent } = await supabase
        .from('friend_requests')
        .select('to_user')
        .eq('from_user', viewer.id)
        .eq('status', 'pending')
        .in('to_user', data.map((p) => p.id))
      setPending(new Set((sent || []).map((r) => r.to_user)))
    }
  }

  const sendRequest = async (person) => {
    const { error } = await supabase.from('friend_requests').insert({ from_user: viewer.id, to_user: person.id, status: 'pending' })
    if (error) notify(shortError(error), 'error')
    else { setPending((p) => new Set([...p, person.id])); notify('تم إرسال طلب الصداقة.', 'success') }
  }

  const matchingPosts = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return posts.slice(0, 15)
    return posts.filter((p) => p.content?.toLowerCase().includes(q))
  }, [posts, query])

  return (
    <section className="panel section-panel">
      <h2>⌕ اكتشف في وَنَس</h2>
      <div className="profile-shortcuts" style={{ marginBottom: '12px' }}>
        <button type="button" className={subTab === 'people' ? 'button primary compact' : 'button secondary compact'} onClick={() => setSubTab('people')}>👥 أشخاص</button>
        <button type="button" className={subTab === 'posts' ? 'button primary compact' : 'button secondary compact'} onClick={() => setSubTab('posts')}>📝 منشورات عامة</button>
        <button type="button" className={subTab === 'tags' ? 'button primary compact' : 'button secondary compact'} onClick={() => setSubTab('tags')}>#️⃣ وسوم</button>
      </div>

      <form className="search-form" onSubmit={search}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن اسم مستخدم، منشور، أو #وسم..." />
        {query && <button type="button" className="icon-button" onClick={() => { setQuery(''); setResults([]) }}>×</button>}
        <button className="button primary compact" disabled={busy}>{busy ? 'بحث…' : 'بحث'}</button>
      </form>

      {subTab === 'people' && (
        <div className="people-list">
          {!results.length ? (
            <p className="muted empty-state">اكتب حرفين على الأقل للبحث عن أشخاص.</p>
          ) : (
            results.map((person) => (
              <div className="person-row" key={person.id}>
                <div onClick={() => onOpenProfile(person)} style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }}>
                  <Avatar profile={person} />
                  <div className="person-info">
                    <strong>{person.display_name || person.username}</strong>
                    <span dir="ltr">@{person.username}</span>
                  </div>
                </div>
                <button type="button" className="button secondary compact" disabled={pending.has(person.id)} onClick={() => sendRequest(person)}>
                  {pending.has(person.id) ? '✓ تم الإرسال' : '➕ إضافة صديق'}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {subTab === 'posts' && (
        <div className="people-list">
          {!matchingPosts.length ? (
            <p className="muted empty-state">لا توجد منشورات مطابقة.</p>
          ) : (
            matchingPosts.map((p) => (
              <div key={p.id} className="person-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <strong>{p.profile?.display_name || p.profile?.username}</strong>
                <p style={{ margin: '4px 0', fontSize: '13px' }}>{p.content}</p>
              </div>
            ))
          )}
        </div>
      )}

      {subTab === 'tags' && (
        <div className="people-list">
          {!tags.length ? (
            <p className="muted empty-state">لا توجد وسوم شائعة حتى الآن.</p>
          ) : (
            tags.map((t) => (
              <div key={t.id} className="person-row">
                <strong>#{t.tag}</strong>
                <span className="count-pill">{t.posts_count} منشور</span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}

function FriendsPanel({ viewer, onOpenProfile, notify }) {
  const [incoming, setIncoming] = useState([])
  const [sent, setSent] = useState([])
  const [friends, setFriends] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [inRes, outRes, friendRes] = await Promise.all([
      supabase.from('friend_requests').select('id,from_user,created_at').eq('to_user', viewer.id).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('friend_requests').select('id,to_user,created_at').eq('from_user', viewer.id).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('friends').select('user_a,user_b').or(`user_a.eq.${viewer.id},user_b.eq.${viewer.id}`),
    ])
    const inIds = (inRes.data || []).map((r) => r.from_user)
    const outIds = (outRes.data || []).map((r) => r.to_user)
    const friendIds = (friendRes.data || []).map((r) => (r.user_a === viewer.id ? r.user_b : r.user_a))
    const allIds = [...new Set([...inIds, ...outIds, ...friendIds])]
    const peopleRes = allIds.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id', allIds) : { data: [] }
    const map = Object.fromEntries((peopleRes.data || []).map((p) => [p.id, p]))
    setIncoming((inRes.data || []).map((r) => ({ ...r, profile: map[r.from_user] })))
    setSent((outRes.data || []).map((r) => ({ ...r, profile: map[r.to_user] })))
    setFriends(friendIds.map((id) => map[id]).filter(Boolean))
    setLoading(false)
  }, [viewer.id])

  useEffect(() => { load() }, [load])

  const accept = async (requestId) => {
    const { error } = await supabase.rpc('accept_friend_request', { request_id: requestId })
    if (error) notify(shortError(error), 'error')
    else { notify('تم قبول طلب الصداقة.', 'success'); load() }
  }

  const decline = async (requestId) => {
    const { error } = await supabase.from('friend_requests').update({ status: 'declined' }).eq('id', requestId)
    if (error) notify(shortError(error), 'error')
    else load()
  }

  const cancelSent = async (requestId) => {
    const { error } = await supabase.from('friend_requests').delete().eq('id', requestId).eq('from_user', viewer.id)
    if (error) notify(shortError(error), 'error')
    else { notify('تم إلغاء الطلب.', 'info'); load() }
  }

  const remove = async (person) => {
    if (!window.confirm(`هل أنت متأكد من إزالة ${person.display_name || person.username} من قائمة الأصدقاء؟`)) return
    const [low, high] = [viewer.id, person.id].sort()
    const { error } = await supabase.from('friends').delete().eq('user_a', low).eq('user_b', high)
    if (error) notify(shortError(error), 'error')
    else { notify('تمت إزالة الصديق.', 'info'); load() }
  }

  const filteredFriends = friends.filter((f) =>
    !filter.trim() ||
    f.username?.toLowerCase().includes(filter.toLowerCase()) ||
    f.display_name?.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <section className="panel section-panel">
      <h2>👥 الأصدقاء وطلبات الصداقة</h2>
      {loading ? (
        <p className="muted">جارٍ التحميل…</p>
      ) : (
        <>
          <h3>📥 طلبات واردة <span className="count-pill">{incoming.length}</span></h3>
          {!incoming.length && <p className="muted">لا توجد طلبات واردة جديدة.</p>}
          {incoming.map((r) => (
            <div className="person-row" key={r.id}>
              <div onClick={() => onOpenProfile(r.profile)} style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }}>
                <Avatar profile={r.profile} />
                <div className="person-info">
                  <strong>{r.profile?.display_name || r.profile?.username || 'مستخدم'}</strong>
                  <span>يريد إضافتك صديقًا</span>
                </div>
              </div>
              <button className="button primary compact" onClick={() => accept(r.id)}>قبول</button>
              <button className="button secondary compact" onClick={() => decline(r.id)}>رفض</button>
            </div>
          ))}

          <h3 className="spaced-heading">📤 طلبات أرسلتها <span className="count-pill">{sent.length}</span></h3>
          {!sent.length && <p className="muted">لا توجد طلبات معلقة أرسلتها.</p>}
          {sent.map((r) => (
            <div className="person-row" key={r.id}>
              <Avatar profile={r.profile} />
              <div className="person-info">
                <strong>{r.profile?.display_name || r.profile?.username || 'مستخدم'}</strong>
                <span dir="ltr">@{r.profile?.username}</span>
              </div>
              <button className="button secondary compact" onClick={() => cancelSent(r.id)}>إلغاء الطلب</button>
            </div>
          ))}

          <h3 className="spaced-heading">🤝 قائمة الأصدقاء <span className="count-pill">{friends.length}</span></h3>
          {friends.length > 0 && (
            <div className="search-form" style={{ marginBottom: '10px' }}>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ابحث داخل أصدقائك..." />
            </div>
          )}
          {!filteredFriends.length && <p className="muted">لا يوجد أصدقاء مطابقون.</p>}
          {filteredFriends.map((p) => (
            <div className="person-row" key={p.id}>
              <div onClick={() => onOpenProfile(p)} style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }}>
                <Avatar profile={p} />
                <div className="person-info">
                  <strong>{p.display_name || p.username}</strong>
                  <span dir="ltr">@{p.username}</span>
                </div>
              </div>
              <button className="button secondary compact danger-text" onClick={() => remove(p)}>إزالة</button>
            </div>
          ))}
        </>
      )}
    </section>
  )
}

function ProfilePanel({ profile, viewerId, posts, onSaved, setTab, notify, PostItemComponent }) {
  const [editing, setEditing] = useState(false)
  const [subTab, setSubTab] = useState('my_posts')
  const [name, setName] = useState(profile.display_name || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(profile.display_name || '')
    setBio(profile.bio || '')
    setAvatarUrl(profile.avatar_url || '')
  }, [profile.id, profile.display_name, profile.bio, profile.avatar_url])

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: name.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', viewerId)
    setBusy(false)
    if (error) notify(shortError(error), 'error')
    else {
      notify('تم تحديث الملف الشخصي.', 'success')
      setEditing(false)
      await onSaved()
    }
  }

  const myPosts = useMemo(() => posts.filter((p) => p.user_id === viewerId && !p.is_archived), [posts, viewerId])
  const myMedia = useMemo(() => myPosts.filter((p) => p.media_urls?.length > 0), [myPosts])
  const myReposts = useMemo(() => posts.filter((p) => p.reposted), [posts])
  const myArchived = useMemo(() => posts.filter((p) => p.user_id === viewerId && p.is_archived), [posts, viewerId])

  const activeList = subTab === 'media' ? myMedia : subTab === 'reposts' ? myReposts : subTab === 'archived' ? myArchived : myPosts

  return (
    <>
      <section className="panel section-panel profile-panel">
        <div className="profile-shortcuts" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="button secondary compact" onClick={() => setTab('friends')}>👥 الأصدقاء</button>
          <button type="button" className="button secondary compact" onClick={() => setTab('saved')}>📖 المحفوظات</button>
          <button type="button" className="button secondary compact" onClick={() => setSubTab('archived')}>📦 الأرشيف</button>
          <button type="button" className="button secondary compact" onClick={() => setTab('settings')}>⚙️ الإعدادات</button>
        </div>

        <div className="profile-summary" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Avatar profile={profile} size="lg" />
            <div>
              <h2>{profile.display_name || profile.username}</h2>
              <p dir="ltr">@{profile.username}</p>
              {profile.bio && <p style={{ color: '#ddd', marginTop: '6px', fontSize: '13px' }}>{profile.bio}</p>}
              <small className="muted" style={{ fontSize: '11px' }}>منشوراتي: {myPosts.length}</small>
            </div>
          </div>
          <button type="button" className="button secondary compact" onClick={() => setEditing((v) => !v)}>
            {editing ? 'إغلاق التعديل' : '✏️ تعديل الملف'}
          </button>
        </div>

        {editing && (
          <form className="form-stack" onSubmit={save} style={{ borderTop: '1px solid #1a1a1a', paddingTop: '14px', marginTop: '10px' }}>
            <label>اسم العرض<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
            <label>نبذة عنك<textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3} /></label>
            <label>رابط الصورة الشخصية (https)<input dir="ltr" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." /></label>
            <button className="button primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</button>
          </form>
        )}

        <div className="profile-shortcuts" style={{ borderTop: '1px solid #161616', paddingTop: '12px', marginTop: '12px', marginBottom: 0 }}>
          <button type="button" className={subTab === 'my_posts' ? 'button primary compact' : 'button secondary compact'} onClick={() => setSubTab('my_posts')}>📝 منشوراتي ({myPosts.length})</button>
          <button type="button" className={subTab === 'media' ? 'button primary compact' : 'button secondary compact'} onClick={() => setSubTab('media')}>🖼️ الوسائط ({myMedia.length})</button>
          <button type="button" className={subTab === 'reposts' ? 'button primary compact' : 'button secondary compact'} onClick={() => setSubTab('reposts')}>🔁 إعادة النشر ({myReposts.length})</button>
          <button type="button" className={subTab === 'archived' ? 'button primary compact' : 'button secondary compact'} onClick={() => setSubTab('archived')}>📦 الأرشيف ({myArchived.length})</button>
        </div>
      </section>

      <section className="feed-list">
        {!activeList.length ? (
          <div className="panel empty-state">لا توجد عناصر في هذا التبويب حالياً.</div>
        ) : (
          activeList.map((post) => <PostItemComponent key={`prof-${post.id}`} post={post} />)
        )}
      </section>
    </>
  )
}

function OtherUserProfileModal({ person, viewerId, onClose, onAddFriend, onReportUser, onBlockUser, notify }) {
  if (!person) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="panel modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <h2>👤 ملف المستخدم</h2>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>
        <div className="profile-summary" style={{ marginTop: '10px' }}>
          <Avatar profile={person} size="lg" />
          <div>
            <h2>{person.display_name || person.username}</h2>
            <p dir="ltr">@{person.username}</p>
            {person.bio && <p style={{ color: '#ddd', marginTop: '6px' }}>{person.bio}</p>}
          </div>
        </div>
        {person.id !== viewerId && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            <button type="button" className="button primary compact" onClick={() => { onAddFriend(person); onClose() }}>➕ إضافة صديق</button>
            <button type="button" className="button secondary compact" onClick={() => { onReportUser(person); onClose() }}>🚩 إبلاغ عن الحساب</button>
            <button type="button" className="button secondary compact danger-text" onClick={() => { onBlockUser({ user_id: person.id }); onClose() }}>🚫 حظر</button>
          </div>
        )}
      </section>
    </div>
  )
}

function SettingsView({
  session,
  profile,
  quietMode,
  onToggleQuiet,
  defaultPrivacy,
  setDefaultPrivacy,
  fontSize,
  setFontSize,
  onSignOut,
  onDeleteAccount,
  setTab,
  notify,
}) {
  const [newPassword, setNewPassword] = useState('')
  const [blockedUsers, setBlockedUsers] = useState([])
  const [busyPwd, setBusyPwd] = useState(false)

  const loadBlocked = useCallback(async () => {
    const { data } = await supabase.from('blocks').select('id,blocked_id').eq('blocker_id', session.user.id)
    const ids = (data || []).map((b) => b.blocked_id)
    if (!ids.length) { setBlockedUsers([]); return }
    const { data: profs } = await supabase.from('profiles').select(PROFILE_FIELDS).in('id', ids)
    const map = Object.fromEntries((profs || []).map((p) => [p.id, p]))
    setBlockedUsers((data || []).map((b) => ({ ...b, profile: map[b.blocked_id] })))
  }, [session.user.id])

  useEffect(() => { loadBlocked() }, [loadBlocked])

  const unblock = async (blockId) => {
    if (!window.confirm('هل تريد فك الحظر عن هذا المستخدم؟')) return
    const { error } = await supabase.from('blocks').delete().eq('id', blockId).eq('blocker_id', session.user.id)
    if (error) notify(shortError(error), 'error')
    else { notify('تم فك الحظر.', 'success'); loadBlocked() }
  }

  const updatePassword = async (e) => {
    e.preventDefault()
    if (newPassword.length < 8) return notify('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.', 'error')
    setBusyPwd(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setBusyPwd(false)
    if (error) notify(shortError(error), 'error')
    else { setNewPassword(''); notify('تم تحديث كلمة المرور بنجاح.', 'success') }
  }

  const exportMyData = () => {
    const blob = new Blob([JSON.stringify({ user: session.user.email, profile }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wanas-data-${profile?.username || 'user'}.json`
    a.click()
    notify('تم تنزيل نسخة من بياناتك.', 'success')
  }

  return (
    <div className="feed-list">
      {/* 14.1 الحساب والأمان */}
      <section className="panel section-panel">
        <h2>🔐 1. الحساب والأمان</h2>
        <div className="form-stack">
          <p className="muted" style={{ margin: 0, fontSize: '13px' }}>البريد المسجل: <code dir="ltr">{session.user.email}</code></p>
          <form onSubmit={updatePassword} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              dir="ltr"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="كلمة مرور جديدة (8 أحرف على الأقل)"
              minLength={8}
            />
            <button className="button primary compact" disabled={busyPwd || !newPassword}>{busyPwd ? '…' : 'تغيير'}</button>
          </form>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="button secondary compact" onClick={() => setTab('profile')}>👤 تعديل ملفي الشخصي</button>
            <button type="button" className="button secondary compact" onClick={() => setTab('saved')}>📖 المحفوظات</button>
            <button type="button" className="button secondary compact" onClick={exportMyData}>📥 طلب نسخة من بياناتي</button>
          </div>
        </div>
      </section>

      {/* 14.2 الخصوصية والجمهور */}
      <section className="panel section-panel">
        <h2>🛡️ 2. الخصوصية والجمهور</h2>
        <div className="form-stack">
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
            <span>الجمهور الافتراضي للمنشور الجديد</span>
            <select
              value={defaultPrivacy}
              onChange={(e) => setDefaultPrivacy(e.target.value)}
              style={{ background: '#000', color: '#fff', padding: '6px 10px', borderRadius: '8px', border: '1px solid #333' }}
            >
              <option value="public">🌐 عام</option>
              <option value="friends">👥 الأصدقاء</option>
              <option value="friends_of_friends">🔗 أصدقاء الأصدقاء</option>
              <option value="only_me">🔒 أنا فقط</option>
            </select>
          </label>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
            <span>الوضع الهادئ (إيقاف الإزعاج)</span>
            <button type="button" className="button secondary compact" onClick={onToggleQuiet}>
              {quietMode ? '🌿 مفعل (إيقاف)' : 'تفعيل الوضع الهادئ'}
            </button>
          </label>
          <div>
            <h3>🚫 قائمة المحظورين ({blockedUsers.length})</h3>
            {!blockedUsers.length ? (
              <p className="muted" style={{ fontSize: '12px', margin: 0 }}>لا يوجد أشخاص محظورون حالياً.</p>
            ) : (
              blockedUsers.map((b) => (
                <div className="person-row" key={b.id}>
                  <Avatar profile={b.profile} size="sm" />
                  <div className="person-info">
                    <strong>{b.profile?.display_name || b.profile?.username || 'مستخدم'}</strong>
                    <span dir="ltr">@{b.profile?.username}</span>
                  </div>
                  <button type="button" className="button secondary compact" onClick={() => unblock(b.id)}>فك الحظر</button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* 14.3 و 14.4 المظهر والتنبيهات والوسائط */}
      <section className="panel section-panel">
        <h2>🎨 3. المظهر، التنبيهات، والوسائط</h2>
        <div className="form-stack">
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
            <span>المظهر</span>
            <select style={{ background: '#000', color: '#fff', padding: '6px 10px', borderRadius: '8px', border: '1px solid #333' }}>
              <option value="oled">أسود قاتم (#000000)</option>
            </select>
          </label>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
            <span>حجم الخط</span>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
              style={{ background: '#000', color: '#fff', padding: '6px 10px', borderRadius: '8px', border: '1px solid #333' }}
            >
              <option value="14px">افتراضي</option>
              <option value="16px">كبير (واضح)</option>
            </select>
          </label>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
            <span>مسح الكاش المحلي</span>
            <button type="button" className="button secondary compact" onClick={() => notify('تم تفريغ الكاش المؤقت بنجاح.', 'success')}>🧹 مسح الكاش</button>
          </label>
        </div>
      </section>

      {/* 14.6 الدعم والقانون وحول وَنَس */}
      <section className="panel section-panel">
        <h2>ℹ️ 4. الدعم والقانون وحول وَنَس</h2>
        <div className="form-stack">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '13px' }}>
            <a href="/terms.html" target="_blank" rel="noreferrer">📜 شروط الاستخدام</a>
            <a href="/privacy.html" target="_blank" rel="noreferrer">🔒 سياسة الخصوصية</a>
          </div>
          <div style={{ padding: '12px', background: '#070707', borderRadius: '12px', border: '1px solid #1f1f1f', textAlign: 'center' }}>
            <strong>وَنَس — WANAS (الإصدار 5.1.0)</strong>
            <p style={{ margin: '6px 0 0', color: '#5eead4', fontSize: '13px', fontWeight: 'bold' }}>
              «تم بناء برمجة هذا البرنامج بواسطة ABD.ALLAH ZOHAIR OMARA»
            </p>
          </div>
          <div style={{ borderTop: '1px solid #161616', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button type="button" className="button secondary" onClick={onSignOut}>🚪 تسجيل الخروج</button>
            <button type="button" className="button danger-text" onClick={onDeleteAccount} style={{ background: '#1f0707', border: '1px solid #5c1515' }}>
              ⚠️ حذف الحساب والبيانات نهائيًا
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function App({ session, onSignOut, onDeleteAccount }) {
  const viewerId = session.user.id
  const [profile, setProfile] = useState(null)
  const [quietMode, setQuietMode] = useState(false)
  const [defaultPrivacy, setDefaultPrivacy] = useState('public')
  const [fontSize, setFontSize] = useState('14px')
  const [posts, setPosts] = useState([])
  const [savedPosts, setSavedPosts] = useState([])
  const [hiddenIds, setHiddenIds] = useState(new Set())
  const [tab, setTab] = useState('home')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(null)
  const [commentsPost, setCommentsPost] = useState(null)
  const [inspectedUser, setInspectedUser] = useState(null)
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
      setProfile({ id: viewerId, username: fallbackUsername, display_name: session.user.user_metadata?.display_name || fallbackUsername })
    } else {
      setProfile(data)
    }
  }, [viewerId, session.user.user_metadata, notify])

  const loadFeed = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('posts').select(POST_FIELDS).order('created_at', { ascending: false }).limit(50)
    if (error) { notify(shortError(error), 'error'); setPosts([]); setLoading(false); return }
    const rows = data || []
    const authorIds = [...new Set(rows.map((r) => r.user_id))]
    const postIds = rows.map((r) => r.id)
    const [peopleRes, likesRes, savesRes, repostsRes] = await Promise.all([
      authorIds.length ? supabase.from('profiles').select(PROFILE_FIELDS).in('id', authorIds) : Promise.resolve({ data: [] }),
      postIds.length ? supabase.from('likes').select('post_id').eq('user_id', viewerId).in('post_id', postIds) : Promise.resolve({ data: [] }),
      postIds.length ? supabase.from('saves').select('post_id').eq('user_id', viewerId).in('post_id', postIds) : Promise.resolve({ data: [] }),
      postIds.length ? supabase.from('reposts').select('post_id').eq('user_id', viewerId).in('post_id', postIds) : Promise.resolve({ data: [] }),
    ])
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

  const toggleQuietMode = async () => {
    const next = !quietMode
    setQuietMode(next)
    await supabase.from('profiles').update({ quiet_mode: next }).eq('id', viewerId)
    notify(next ? '🌿 تم تفعيل الوضع الهادئ.' : 'تم إيقاف الوضع الهادئ.', 'info')
  }

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
    setPosts(update)
    setSavedPosts(update)
    const result = next ? await supabase.from('reposts').insert({ user_id: viewerId, post_id: post.id }) : await supabase.from('reposts').delete().eq('user_id', viewerId).eq('post_id', post.id)
    if (result.error) { notify(shortError(result.error), 'error'); setRefreshKey((v) => v + 1) }
    else notify(next ? '🔁 تمت إعادة النشر.' : 'تم إلغاء إعادة النشر.', 'success')
  }

  const editPost = async (post) => {
    const content = window.prompt('✏️ عدّل نص المنشور:', post.content || '')
    if (content === null || !content.trim()) return
    const { error } = await supabase.from('posts').update({ content: content.trim().slice(0, 5000), is_edited: true, edited_at: new Date().toISOString() }).eq('id', post.id).eq('user_id', viewerId)
    if (error) notify(shortError(error), 'error')
    else { notify('تم تعديل المنشور.', 'success'); setRefreshKey((v) => v + 1) }
  }

  const changePostPrivacy = async (post) => {
    const choice = window.prompt('اختر الجمهور الجديد (public / friends / friends_of_friends / only_me):', post.privacy || 'public')
    if (!choice || !PRIVACY_LABELS[choice]) return
    const { error } = await supabase.from('posts').update({ privacy: choice }).eq('id', post.id).eq('user_id', viewerId)
    if (error) notify(shortError(error), 'error')
    else { notify(`تم تغيير الجمهور إلى ${PRIVACY_LABELS[choice]}`, 'success'); setRefreshKey((v) => v + 1) }
  }

  const changeCommentSetting = async (post) => {
    const choice = window.prompt('من يستطيع التعليق؟ (everyone / friends / mentioned_only / none):', post.comment_setting || 'everyone')
    if (!choice || !COMMENT_LABELS[choice]) return
    const { error } = await supabase.from('posts').update({ comment_setting: choice }).eq('id', post.id).eq('user_id', viewerId)
    if (error) notify(shortError(error), 'error')
    else { notify(`تم ضبط التعليقات: ${COMMENT_LABELS[choice]}`, 'success'); setRefreshKey((v) => v + 1) }
  }

  const toggleArchive = async (post) => {
    const next = !post.is_archived
    const { error } = await supabase.from('posts').update({ is_archived: next }).eq('id', post.id).eq('user_id', viewerId)
    if (error) notify(shortError(error), 'error')
    else {
      if (next) await supabase.from('archives').insert({ user_id: viewerId, post_id: post.id })
      else await supabase.from('archives').delete().eq('user_id', viewerId).eq('post_id', post.id)
      notify(next ? '📦 تم نقل المنشور إلى الأرشيف.' : 'تمت استعادة المنشور من الأرشيف.', 'success')
      setRefreshKey((v) => v + 1)
    }
  }

  const toggleSave = async (post) => {
    const result = post.saved ? await supabase.from('saves').delete().eq('user_id', viewerId).eq('post_id', post.id) : await supabase.from('saves').insert({ user_id: viewerId, post_id: post.id })
    if (result.error) notify(shortError(result.error), 'error')
    else { notify(post.saved ? 'أُزيل المنشور من المحفوظات.' : '📖 تم حفظ المنشور.', 'success'); setRefreshKey((v) => v + 1) }
  }

  const deletePost = async (post) => {
    if (!window.confirm('هل تريد حذف هذا المنشور نهائيًا؟')) return
    const { error } = await supabase.from('posts').delete().eq('id', post.id).eq('user_id', viewerId)
    if (error) notify(shortError(error), 'error')
    else {
      const paths = (post.media_urls || []).filter((p) => p && !/^https?:\/\//i.test(p))
      if (paths.length) await supabase.storage.from('posts').remove(paths)
      notify('🗑️ تم حذف المنشور.', 'success')
      setRefreshKey((v) => v + 1)
    }
  }

  const hidePost = (post) => {
    setHiddenIds((prev) => new Set([...prev, post.id]))
    notify('🙈 تم إخفاء المنشور من موجزك الحالي.', 'info')
  }

  const reportPost = async (post) => {
    const reason = window.prompt('⚠️ اكتب سبب الإبلاغ عن المنشور (إزعاج، إساءة، انتحال، إلخ):')
    if (!reason?.trim()) return
    const { error } = await supabase.from('reports').insert({ reporter_id: viewerId, reported_post_id: post.id, reported_user_id: post.user_id, reason: reason.trim().slice(0, 500), type: 'post' })
    if (error) notify(shortError(error), 'error')
    else notify('⚠️ تم إرسال البلاغ للمراجعة.', 'success')
  }

  const reportUser = async (targetProfile) => {
    if (!targetProfile?.id) return
    const reason = window.prompt(`🚩 سبب الإبلاغ عن الحساب @${targetProfile.username}:`)
    if (!reason?.trim()) return
    const { error } = await supabase.from('reports').insert({ reporter_id: viewerId, reported_user_id: targetProfile.id, reason: reason.trim().slice(0, 500), type: 'user' })
    if (error) notify(shortError(error), 'error')
    else notify('🚩 تم إرسال البلاغ عن الحساب للمراجعة.', 'success')
  }

  const blockUser = async (post) => {
    if (post.user_id === viewerId || !window.confirm('🚫 حظر هذا المستخدم؟ لن تظهر لك منشوراته أو رسائله بعد ذلك.')) return
    const { error } = await supabase.from('blocks').insert({ blocker_id: viewerId, blocked_id: post.user_id })
    if (error) notify(shortError(error), 'error')
    else { notify('🚫 تم حظر المستخدم.', 'success'); setRefreshKey((v) => v + 1) }
  }

  const quickAddFriend = async (targetProfile) => {
    if (!targetProfile?.id || targetProfile.id === viewerId) return
    const { error } = await supabase.from('friend_requests').insert({ from_user: viewerId, to_user: targetProfile.id, status: 'pending' })
    if (error) notify(shortError(error), 'error')
    else notify('👥 تم إرسال طلب الصداقة.', 'success')
  }

  const refreshProfile = async () => { await loadProfile(); setRefreshKey((v) => v + 1) }

  const homePosts = useMemo(
    () => posts.filter((p) => !p.is_archived && !hiddenIds.has(p.id)),
    [posts, hiddenIds]
  )

  const renderPostItem = ({ post }) => (
    <PostItem
      key={post.id}
      post={post}
      viewerId={viewerId}
      onLike={toggleLike}
      onSave={toggleSave}
      onRepost={toggleRepost}
      onComment={setCommentsPost}
      onDelete={deletePost}
      onEdit={editPost}
      onChangePrivacy={changePostPrivacy}
      onChangeCommentSetting={changeCommentSetting}
      onArchive={toggleArchive}
      onHidePost={hidePost}
      onReportPost={reportPost}
      onReportUser={reportUser}
      onBlock={blockUser}
      onOpenProfile={(p) => setInspectedUser(p)}
      onAddFriend={quickAddFriend}
      onMessageUser={() => setTab('messages')}
      notify={notify}
    />
  )

  const pageTitle = {
    home: 'آخر المنشورات',
    video: 'فيديو',
    councils: 'المجالس',
    messages: 'الرسائل',
    settings: 'إعدادات التطبيق',
    profile: 'ملفي الشخصي',
    notifications: 'مركز التنبيهات',
    saved: '📖 المحفوظات',
    friends: '👥 مجتمعك والأصدقاء',
    search: '⌕ اكتشف',
  }[tab] || 'وَنَس'

  return (
    <div className="app-shell" dir="rtl" style={{ fontSize }}>
      <AppHeader profile={profile} quietMode={quietMode} onToggleQuiet={toggleQuietMode} setTab={setTab} />

      <main className="main-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">مساحة الونس</p>
            <h1>{pageTitle}</h1>
          </div>
          <button type="button" className="icon-button refresh-button" title="تحديث" onClick={() => setRefreshKey((v) => v + 1)}>↻</button>
        </div>

        {notice && (
          <div className={`toast ${notice.type}`} role="status">
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="إغلاق">×</button>
          </div>
        )}

        {tab === 'home' && profile && (
          <>
            <StoryRail viewerId={viewerId} profile={profile} notify={notify} />
            <Composer profile={profile} defaultPrivacy={defaultPrivacy} onCreated={() => setRefreshKey((v) => v + 1)} notify={notify} />
            <section className="feed-list" aria-live="polite">
              {loading ? (
                <div className="panel empty-state">جارٍ تحميل المنشورات…</div>
              ) : !homePosts.length ? (
                <div className="panel empty-state">لا توجد منشورات بعد. كن أول من يشارك!</div>
              ) : (
                homePosts.map((post) => renderPostItem({ post }))
              )}
            </section>
          </>
        )}

        {tab === 'search' && <DiscoverPanel viewer={session.user} posts={homePosts} onOpenProfile={setInspectedUser} notify={notify} />}
        {tab === 'friends' && <FriendsPanel viewer={session.user} onOpenProfile={setInspectedUser} notify={notify} />}
        {tab === 'video' && <div className="panel empty-state"><h3>📹 فيديو</h3><p className="muted">مقاطع الفيديو القصيرة ستظهر هنا قريباً.</p></div>}
        {tab === 'councils' && <div className="panel empty-state"><h3>🎧 المجالس</h3><p className="muted">المجالس الصوتية الحية قادمة قريباً.</p></div>}
        {tab === 'messages' && <MessagesPanel viewer={session.user} notify={notify} />}
        {tab === 'notifications' && <NotificationsPanel viewer={session.user} notify={notify} />}

        {tab === 'profile' && profile && (
          <ProfilePanel
            profile={profile}
            viewerId={viewerId}
            posts={posts}
            onSaved={refreshProfile}
            setTab={setTab}
            notify={notify}
            PostItemComponent={renderPostItem}
          />
        )}

        {tab === 'saved' && (
          <section className="feed-list">
            {!savedPosts.length ? (
              <div className="panel empty-state">📖 لا توجد منشورات محفوظة حتى الآن.</div>
            ) : (
              savedPosts.map((post) => renderPostItem({ post }))
            )}
          </section>
        )}

        {tab === 'settings' && (
          <SettingsView
            session={session}
            profile={profile}
            quietMode={quietMode}
            onToggleQuiet={toggleQuietMode}
            defaultPrivacy={defaultPrivacy}
            setDefaultPrivacy={setDefaultPrivacy}
            fontSize={fontSize}
            setFontSize={setFontSize}
            onSignOut={onSignOut}
            onDeleteAccount={onDeleteAccount}
            setTab={setTab}
            notify={notify}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        {[
          ['home', 'الرئيسية', '⌂'],
          ['video', 'فيديو', '▶'],
          ['councils', 'المجالس', '🎧'],
          ['messages', 'الرسائل', '✉'],
          ['settings', 'الإعدادات', '⚙'],
        ].map(([id, label, icon]) => (
          <button key={id} type="button" className={tab === id ? 'nav-item selected' : 'nav-item'} onClick={() => setTab(id)}>
            <span aria-hidden="true">{icon}</span>
            <small>{label}</small>
          </button>
        ))}
      </nav>

      {commentsPost && <CommentsDialog post={commentsPost} viewer={session.user} onClose={() => setCommentsPost(null)} notify={notify} />}
      {inspectedUser && (
        <OtherUserProfileModal
          person={inspectedUser}
          viewerId={viewerId}
          onClose={() => setInspectedUser(null)}
          onAddFriend={quickAddFriend}
          onReportUser={reportUser}
          onBlockUser={blockUser}
          notify={notify}
        />
      )}
    </div>
  )
}
