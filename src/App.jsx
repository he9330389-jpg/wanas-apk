import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './utils/supabase.js'

const PROFILE_FIELDS = 'id,username,display_name,bio,avatar_url,is_verified,created_at'
const POST_FIELDS = 'id,user_id,content,media_urls,media_type,privacy,created_at,likes_count,comments_count'
const PUBLIC_APP_URL = (import.meta.env.VITE_APP_URL || 'https://wanas-apk-global.vercel.app').replace(/\/$/, '')

const shortError = (e) => e?.message || 'حدث خطأ'
const initials = (n='') => (n.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('')||'و').toUpperCase()
const timeAgo = (d) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime())/1000))
  if(s<60) return 'الآن'
  if(s<3600) return `منذ ${Math.floor(s/60)} د`
  if(s<86400) return `منذ ${Math.floor(s/3600)} س`
  return `منذ ${Math.floor(s/86400)} ي`
}

function Avatar({ profile, size='md' }){
  const name = profile?.display_name || profile?.username || 'ونس'
  const cls = `avatar avatar-${size}`
  return profile?.avatar_url ? <img className={cls} src={profile.avatar_url} alt={name}/> : <span className={`${cls} avatar-fallback`}>{initials(name)}</span>
}

function AppHeader({ profile, quietMode, onToggleQuiet, setTab }){
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-lockup" onClick={()=>setTab('home')} style={{cursor:'pointer'}}>
          <div className="brand-mark">و</div><span>WANAS</span>
        </div>
        <div className="header-actions" style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <button type="button" className="subtle-button" onClick={onToggleQuiet} style={{background: quietMode ? '#065f46' : '#102a22', color:'#5eead4', padding:'5px 11px', borderRadius:'20px', fontSize:'11px', border: quietMode ? '1px solid #34d399' : '1px solid transparent'}}>🌿 {quietMode ? 'هادئ (مفعل)' : 'هادئ'}</button>
          <button type="button" className="icon-button" onClick={()=>setTab('search')}>⌕</button>
          <button type="button" className="icon-button" onClick={()=>setTab('notifications')}>🔔</button>
          <button type="button" className="icon-button" onClick={()=>setTab('profile')} style={{padding:0,overflow:'hidden'}}><Avatar profile={profile} size="sm"/></button>
        </div>
      </div>
    </header>
  )
}

function Composer({ profile, onCreated, notify }){
  const [content,setContent] = useState('')
  const [file,setFile] = useState(null)
  const [busy,setBusy] = useState(false)
  const inputRef = useRef(null)

  const submit = async (e)=>{
    e.preventDefault()
    if(!content.trim() && !file) return
    if(file && file.size > 10*1024*1024) return notify('الصورة أكبر من 10 ميجا','error')
    setBusy(true)
    let path = null
    try{
      if(file){
        const ext = (file.name.split('.').pop()||'jpg').toLowerCase()
        const uuid = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()
        path = `${profile.id}/${uuid}.${ext}`
        const { error } = await supabase.storage.from('posts').upload(path, file)
        if(error) throw error
      }
      const { error } = await supabase.from('posts').insert({ user_id: profile.id, content: content.trim() || ' ', media_type: file?'image':'none', media_urls: path?[path]:[], privacy:'public' })
      if(error) throw error
      setContent(''); setFile(null); if(inputRef.current) inputRef.current.value=''
      notify('تم النشر','success'); onCreated()
    }catch(err){ if(path) await supabase.storage.from('posts').remove([path]); notify(shortError(err),'error') } finally{ setBusy(false) }
  }

  return (
    <form className="panel composer" onSubmit={submit}>
      <div className="composer-top"><Avatar profile={profile}/><textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="هتونسنا النهارده؟ شاركنا اللي في بالك..." maxLength={5000} rows={3}/></div>
      {file && <div className="file-chip"><span>🖼️ {file.name}</span><button type="button" onClick={()=>{setFile(null); if(inputRef.current) inputRef.current.value=''}}>×</button></div>}
      <div className="composer-footer">
        <div className="composer-options" style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
          <button type="button" className="subtle-button" onClick={()=>inputRef.current?.click()}>🖼️ صورة</button>
          <button type="button" className="subtle-button" onClick={()=>notify('الفيديو قريباً','info')}>📹 فيديو</button>
          <button type="button" className="subtle-button" onClick={()=>notify('الصوت قريباً','info')}>🎙️ صوت</button>
          <button type="button" className="subtle-button">+ المزيد</button>
          <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/>
        </div>
        <button className="button primary compact" disabled={busy || (!content.trim() && !file)}>{busy?'جارٍ النشر…':'نشر'}</button>
      </div>
    </form>
  )
}

function PostItem({ post, viewerId, onLike, onDelete, onOpenProfile }){
  const [mediaSrc,setMediaSrc]=useState('')
  const path = post.media_urls?.[0]
  useEffect(()=>{
    if(!path) return
    if(/^https?:\/\//i.test(path)) setMediaSrc(path)
    else supabase.storage.from('posts').createSignedUrl(path,3600).then(({data})=> setMediaSrc(data?.signedUrl||''))
  },[path])
  return (
    <article className="panel post-item">
      <div className="post-head">
        <div onClick={()=>onOpenProfile(post.profile)} style={{cursor:'pointer',display:'flex',gap:'11px',alignItems:'center',flex:1}}>
          <Avatar profile={post.profile}/><div className="post-author"><strong>{post.profile?.display_name||post.profile?.username||'مستخدم'}</strong><span>@{post.profile?.username} · {timeAgo(post.created_at)}</span></div>
        </div>
        {post.user_id===viewerId && <button className="icon-button" onClick={()=>onDelete(post)}>🗑️</button>}
      </div>
      {post.content?.trim() && <p className="post-content">{post.content}</p>}
      {mediaSrc && <img className="post-media" src={mediaSrc} alt="مرفق"/>}
      <div className="post-actions">
        <button className={post.liked?'action active':'action'} onClick={()=>onLike(post)}>{post.liked?'♥ أعجبني':'♡ إعجاب'} {post.likes_count||0}</button>
        <button className="action">💬 {post.comments_count||0}</button>
        <button className="action">🔗 مشاركة</button>
      </div>
    </article>
  )
}

export default function App({ session, onSignOut }){
  const viewerId = session.user.id
  const [profile,setProfile]=useState(null)
  const [posts,setPosts]=useState([])
  const [tab,setTab]=useState('home')
  const [quietMode,setQuietMode]=useState(false)
  const [notice,setNotice]=useState(null)
  const [loading,setLoading]=useState(true)

  const notify = useCallback((text,type='info')=>{
    setNotice({text,type}); setTimeout(()=>setNotice(null),3000)
  },[])

  const loadProfile = useCallback(async()=>{
    const { data } = await supabase.from('profiles').select(PROFILE_FIELDS).eq('id',viewerId).maybeSingle()
    if(!data) setProfile({id:viewerId, username: session.user.email?.split('@')[0]||'user', display_name: session.user.user_metadata?.display_name||'مستخدم'})
    else setProfile(data)
  },[viewerId, session])

  const loadFeed = useCallback(async()=>{
    setLoading(true)
    const { data, error } = await supabase.from('posts').select(POST_FIELDS).order('created_at',{ascending:false}).limit(50)
    if(error){ setPosts([]); setLoading(false); return }
    const ids = [...new Set((data||[]).map(r=>r.user_id))]
    const { data: profs } = ids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',ids) : {data:[]}
    const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]))
    const { data: likes } = await supabase.from('likes').select('post_id').eq('user_id',viewerId)
    const likedSet = new Set((likes||[]).map(l=>l.post_id))
    setPosts((data||[]).map(r=>({...r, profile: map[r.user_id], liked: likedSet.has(r.id)}))); setLoading(false)
  },[viewerId])

  useEffect(()=>{ loadProfile() },[loadProfile])
  useEffect(()=>{ loadFeed() },[loadFeed])

  const toggleLike = async (post)=>{
    const next = !post.liked
    setPosts(p=>p.map(x=> x.id===post.id ? {...x, liked:next, likes_count: Math.max(0,(x.likes_count||0)+(next?1:-1))} : x))
    if(next) await supabase.from('likes').insert({user_id:viewerId, post_id:post.id})
    else await supabase.from('likes').delete().eq('user_id',viewerId).eq('post_id',post.id)
  }
  const deletePost = async (post)=>{
    if(!window.confirm('حذف المنشور؟')) return
    await supabase.from('posts').delete().eq('id',post.id).eq('user_id',viewerId)
    setPosts(p=>p.filter(x=>x.id!==post.id))
  }

  return (
    <div className="app-shell" dir="rtl" style={{fontSize:'14px'}}>
      <AppHeader profile={profile} quietMode={quietMode} onToggleQuiet={()=>setQuietMode(v=>!v)} setTab={setTab}/>
      <main className="main-content">
        <div className="page-heading"><div><p className="eyebrow">مساحة الونس</p><h1>{tab==='home'?'آخر المنشورات': tab}</h1></div><button className="icon-button" onClick={loadFeed}>↻</button></div>
        {notice && <div className={`toast ${notice.type}`}><span>{notice.text}</span><button onClick={()=>setNotice(null)}>×</button></div>}
        {tab==='home' && <>
          {profile && <Composer profile={profile} onCreated={loadFeed} notify={notify}/>}
          <section className="feed-list">
            {loading ? <div className="panel empty-state">جارٍ التحميل…</div> : !posts.length ? <div className="panel empty-state">لا توجد منشورات بعد. كن أول من يشارك!</div> : posts.map(p=> <PostItem key={p.id} post={p} viewerId={viewerId} onLike={toggleLike} onDelete={deletePost} onOpenProfile={()=>{}}/>)}
          </section>
        </>}
        {tab!=='home' && <div className="panel empty-state"><h3>{tab}</h3><p className="muted">القسم ده قادم قريباً</p><button className="button secondary compact" onClick={()=>setTab('home')}>الرجوع للرئيسية</button></div>}
      </main>
      <nav className="bottom-nav">
        {[
          ['home','الرئيسية','⌂'],
          ['video','فيديو','▶'],
          ['councils','المجالس','🎧'],
          ['messages','الرسائل','✉'],
          ['settings','الإعدادات','⚙'],
        ].map(([id,label,icon])=>(
          <button key={id} type="button" className={tab===id?'nav-item selected':'nav-item'} onClick={()=>setTab(id)}><span>{icon}</span><small>{label}</small></button>
        ))}
      </nav>
    </div>
  )
}
