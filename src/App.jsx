import React, { useCallback, useEffect, useState, useRef } from 'react'
import { supabase } from './utils/supabase.js'

const PROFILE_FIELDS = 'id,username,display_name,bio,avatar_url,is_verified,created_at'
const POST_FIELDS = 'id,user_id,content,media_urls,media_type,privacy,created_at,likes_count,comments_count'

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

function AppHeader({ profile, quietMode, onToggleQuiet, setTab, notifCount }){
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-lockup" onClick={()=>setTab('home')} style={{cursor:'pointer'}}>
          <div className="brand-mark">و</div><span>WANAS</span>
        </div>
        <div className="header-actions" style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <button type="button" className="subtle-button" onClick={onToggleQuiet} style={{background: quietMode ? '#065f46' : '#102a22', color:'#5eead4', padding:'5px 11px', borderRadius:'20px', fontSize:'11px', border: quietMode ? '1px solid #34d399' : '1px solid transparent'}}>🌿 {quietMode ? 'هادئ (مفعل)' : 'هادئ'}</button>
          <button type="button" className="icon-button" onClick={()=>setTab('search')}>⌕</button>
          <button type="button" className="icon-button" onClick={()=>setTab('notifications')} style={{position:'relative'}}>🔔{notifCount>0 && <span style={{position:'absolute',top:'-4px',right:'-4px',background:'#ef4444',color:'white',fontSize:'9px',width:'16px',height:'16px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center'}}>{notifCount}</span>}</button>
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

function PostItem({ post, viewerId, onLike, onDelete, onOpenComments, onShare }){
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
        <div style={{cursor:'pointer',display:'flex',gap:'11px',alignItems:'center',flex:1}}>
          <Avatar profile={post.profile}/><div className="post-author"><strong>{post.profile?.display_name||post.profile?.username||'مستخدم'}</strong><span>@{post.profile?.username} · {timeAgo(post.created_at)}</span></div>
        </div>
        {post.user_id===viewerId && <button className="icon-button" onClick={()=>onDelete(post)}>🗑️</button>}
      </div>
      {post.content?.trim() && <p className="post-content">{post.content}</p>}
      {mediaSrc && <img className="post-media" src={mediaSrc} alt="مرفق" style={{width:'100%',borderRadius:'12px',marginTop:'10px'}}/>}
      <div className="post-actions" style={{display:'flex',gap:'16px',marginTop:'12px'}}>
        <button className={post.liked?'action active':'action'} onClick={()=>onLike(post)} style={{background:'none',border:'none',color: post.liked ? '#ef4444' : '#9ca3af',cursor:'pointer'}}>{post.liked?'♥ أعجبني':'♡ إعجاب'} {post.likes_count||0}</button>
        <button className="action" onClick={()=>onOpenComments(post)} style={{background:'none',border:'none',color:'#9ca3af',cursor:'pointer'}}>💬 تعليق {post.comments_count||0}</button>
        <button className="action" onClick={()=>onShare(post)} style={{background:'none',border:'none',color:'#9ca3af',cursor:'pointer'}}>🔗 مشاركة</button>
      </div>
    </article>
  )
}

function CommentsSheet({ post, viewerProfile, onClose, notify }){
  const [comments,setComments]=useState([])
  const [text,setText]=useState('')
  const [loading,setLoading]=useState(true)

  const load = useCallback(async()=>{
    setLoading(true)
    const { data } = await supabase.from('comments').select('id,content,created_at,user_id').eq('post_id',post.id).order('created_at',{ascending:true})
    const ids = [...new Set((data||[]).map(c=>c.user_id))]
    const { data: profs } = ids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',ids) : {data:[]}
    const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]))
    setComments((data||[]).map(c=>({...c, profile: map[c.user_id]})))
    setLoading(false)
  },[post.id])

  useEffect(()=>{ load() },[load])

  const send = async (e)=>{
    e.preventDefault()
    if(!text.trim()) return
    try{
      const { error } = await supabase.from('comments').insert({ user_id: viewerProfile.id, post_id: post.id, content: text.trim() })
      if(error) throw error
      setText(''); load()
    }catch(err){ notify(shortError(err),'error') }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:100,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div className="panel" style={{width:'100%',maxWidth:'600px',maxHeight:'80vh',borderRadius:'20px 20px 0 0',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px',borderBottom:'1px solid #222'}}>
          <strong>التعليقات ({post.comments_count||0})</strong>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer'}}>×</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:'12px'}}>
          {loading ? <div className="muted">جارٍ التحميل...</div> :
           !comments.length ? <div className="muted">لا توجد تعليقات بعد. كن أول من يعلق!</div> :
           comments.map(c=>(
            <div key={c.id} style={{display:'flex',gap:'10px'}}>
              <Avatar profile={c.profile} size="sm"/>
              <div style={{background:'#1a1a1a',padding:'8px 12px',borderRadius:'12px',flex:1}}>
                <strong style={{fontSize:'13px'}}>{c.profile?.display_name||c.profile?.username}</strong>
                <p style={{margin:'4px 0 0',fontSize:'14px'}}>{c.content}</p>
                <small style={{color:'#666',fontSize:'11px'}}>{timeAgo(c.created_at)}</small>
              </div>
            </div>
           ))}
        </div>
        <form onSubmit={send} style={{padding:'12px',display:'flex',gap:'8px',borderTop:'1px solid #222'}}>
          <input value={text} onChange={e=>setText(e.target.value)} placeholder="اكتب تعليقاً..." style={{flex:1,background:'#111',border:'1px solid #333',borderRadius:'20px',padding:'10px 14px',color:'white'}}/>
          <button className="button primary compact" type="submit" disabled={!text.trim()}>إرسال</button>
        </form>
      </div>
    </div>
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
  const [activePost,setActivePost]=useState(null)
  const [notifCount,setNotifCount]=useState(0)

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
    if(error){ console.log(error); setPosts([]); setLoading(false); return }
    const ids = [...new Set((data||[]).map(r=>r.user_id))]
    const { data: profs } = ids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',ids) : {data:[]}
    const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]))
    const { data: likes } = await supabase.from('likes').select('post_id').eq('user_id',viewerId)
    const likedSet = new Set((likes||[]).map(l=>l.post_id))
    setPosts((data||[]).map(r=>({...r, profile: map[r.user_id], liked: likedSet.has(r.id)}))); setLoading(false)
  },[viewerId])

  const loadNotifs = useCallback(async()=>{
    const { count } = await supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',viewerId).eq('is_read',false)
    setNotifCount(count||0)
  },[viewerId])

  useEffect(()=>{ loadProfile() },[loadProfile])
  useEffect(()=>{ loadFeed(); loadNotifs() },[loadFeed, loadNotifs])

  const toggleLike = async (post)=>{
    const next = !post.liked
    setPosts(p=>p.map(x=> x.id===post.id ? {...x, liked:next, likes_count: Math.max(0,(x.likes_count||0)+(next?1:-1))} : x))
    try{
      if(next) {
        const { error } = await supabase.from('likes').insert({user_id:viewerId, post_id:post.id})
        if(error) throw error
      } else {
        const { error } = await supabase.from('likes').delete().eq('user_id',viewerId).eq('post_id',post.id)
        if(error) throw error
      }
    }catch(e){ 
      // revert on error
      setPosts(p=>p.map(x=> x.id===post.id ? {...x, liked:!next, likes_count: Math.max(0,(x.likes_count||0)+(!next?1:-1))} : x))
      notify(shortError(e),'error')
    }
  }
  
  const deletePost = async (post)=>{
    if(!window.confirm('حذف المنشور؟')) return
    const { error } = await supabase.from('posts').delete().eq('id',post.id).eq('user_id',viewerId)
    if(error) return notify(shortError(error),'error')
    setPosts(p=>p.filter(x=>x.id!==post.id))
    notify('تم الحذف','success')
  }

  const sharePost = async (post)=>{
    const url = `https://wanas-apk-global.vercel.app/post/${post.id}`
    if(navigator.share){
      try{ await navigator.share({title:'WANAS', text: post.content, url}); } catch{}
    } else if(navigator.clipboard){
      await navigator.clipboard.writeText(url)
      notify('تم نسخ رابط المنشور','success')
    } else {
      notify(url,'info')
    }
  }

  const handleCommentAdded = () => {
    if(activePost){
      setPosts(p=>p.map(x=> x.id===activePost.id ? {...x, comments_count: (x.comments_count||0)+1} : x))
      setActivePost(a=> a ? {...a, comments_count: (a.comments_count||0)+1} : a)
    }
  }

  return (
    <div className="app-shell" dir="rtl" style={{fontSize:'14px'}}>
      <AppHeader profile={profile} quietMode={quietMode} onToggleQuiet={()=>setQuietMode(v=>!v)} setTab={setTab} notifCount={notifCount}/>
      <main className="main-content">
        <div className="page-heading"><div><p className="eyebrow">مساحة الونس</p><h1>{tab==='home'?'آخر المنشورات': tab==='search'?'البحث': tab==='notifications'?'الإشعارات': tab==='profile'?'الملف الشخصي': tab}</h1></div><button className="icon-button" onClick={loadFeed}>↻</button></div>
        {notice && <div className={`toast ${notice.type}`} style={{background: notice.type==='error' ? '#7f1d1d' : '#065f46', color:'white', padding:'10px 14px', borderRadius:'10px', marginBottom:'12px', display:'flex', justifyContent:'space-between'}}><span>{notice.text}</span><button onClick={()=>setNotice(null)} style={{background:'none',border:'none',color:'white',cursor:'pointer'}}>×</button></div>}
        
        {tab==='home' && <>
          {profile && <Composer profile={profile} onCreated={loadFeed} notify={notify}/>}
          <section className="feed-list" style={{display:'flex',flexDirection:'column',gap:'12px',marginTop:'12px'}}>
            {loading ? <div className="panel empty-state">جارٍ التحميل…</div> : !posts.length ? <div className="panel empty-state">لا توجد منشورات بعد. كن أول من يشارك!</div> : posts.map(p=> <PostItem key={p.id} post={p} viewerId={viewerId} onLike={toggleLike} onDelete={deletePost} onOpenComments={setActivePost} onShare={sharePost}/>)}
          </section>
        </>}

        {tab==='search' && <div className="panel empty-state"><h3>البحث</h3><p className="muted">ابحث عن الأشخاص والمنشورات - قريباً</p><button className="button secondary compact" onClick={()=>setTab('home')}>الرجوع للرئيسية</button></div>}
        
        {tab==='notifications' && <NotificationsTab viewerId={viewerId} setTab={setTab} onRead={()=>setNotifCount(0)}/>}
        
        {tab==='profile' && profile && <ProfileTab profile={profile} myPosts={posts.filter(p=>p.user_id===viewerId)} onSignOut={onSignOut}/>}

        {(tab==='video' || tab==='councils' || tab==='messages' || tab==='settings') && <div className="panel empty-state"><h3>{tab==='video'?'فيديو': tab==='councils'?'المجالس': tab==='messages'?'الرسائل':'الإعدادات'}</h3><p className="muted">القسم ده قادم قريباً في التحديث الجاي</p><button className="button secondary compact" onClick={()=>setTab('home')}>الرجوع للرئيسية</button></div>}
      </main>

      <nav className="bottom-nav" style={{position:'fixed',bottom:0,left:0,right:0,background:'#0a0a0a',borderTop:'1px solid #222',display:'flex',justifyContent:'space-around',padding:'6px 0 calc(6px + env(safe-area-inset-bottom))',zIndex:10}}>
        {[
          ['home','الرئيسية','⌂'],
          ['video','فيديو','▶'],
          ['councils','المجالس','🎧'],
          ['messages','الرسائل','✉'],
          ['settings','الإعدادات','⚙'],
        ].map(([id,label,icon])=>(
          <button key={id} type="button" className={tab===id?'nav-item selected':'nav-item'} onClick={()=>setTab(id)} style={{background:'none',border:'none',color: tab===id ? 'white' : '#666',display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',cursor:'pointer',padding:'4px 16px',borderRadius:'12px',backgroundColor: tab===id ? '#1a1a1a' : 'transparent'}}><span style={{fontSize:'20px'}}>{icon}</span><small style={{fontSize:'10px'}}>{label}</small></button>
        ))}
      </nav>

      {activePost && <CommentsSheet post={activePost} viewerProfile={profile} onClose={()=>{setActivePost(null); loadFeed()}} notify={notify}/>}
    </div>
  )
}

function NotificationsTab({ viewerId, setTab, onRead }){
  const [notifs,setNotifs]=useState([])
  useEffect(()=>{
    supabase.from('notifications').select('id,type,created_at,from_user,post_id').eq('user_id',viewerId).order('created_at',{ascending:false}).limit(30).then(async ({data})=>{
      const ids = [...new Set((data||[]).map(n=>n.from_user).filter(Boolean))]
      const { data: profs } = ids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',ids) : {data:[]}
      const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]))
      setNotifs((data||[]).map(n=>({...n, from_profile: map[n.from_user]})))
      if((data||[]).length) { supabase.from('notifications').update({is_read:true}).eq('user_id',viewerId).then(()=>onRead()) }
    })
  },[viewerId])
  return (
    <div className="feed-list" style={{display:'flex',flexDirection:'column',gap:'8px'}}>
      {!notifs.length ? <div className="panel empty-state">لا توجد إشعارات</div> : notifs.map(n=>(
        <div key={n.id} className="panel" style={{padding:'12px',display:'flex',gap:'10px',alignItems:'center'}}>
          <Avatar profile={n.from_profile} size="sm"/>
          <div style={{flex:1}}>
            <p style={{margin:0,fontSize:'14px'}}><strong>{n.from_profile?.display_name||'مستخدم'}</strong> {n.type==='like'?'أعجب بمنشورك': n.type==='comment'?'علق على منشورك':'أرسل لك طلب صداقة'}</p>
            <small style={{color:'#666'}}>{timeAgo(n.created_at)}</small>
          </div>
        </div>
      ))}
    </div>
  )
}

function ProfileTab({ profile, myPosts, onSignOut }){
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
      <div className="panel" style={{textAlign:'center',padding:'20px'}}>
        <div style={{display:'flex',justifyContent:'center',marginBottom:'12px'}}><Avatar profile={profile} size="md"/></div>
        <h2 style={{margin:'0 0 4px'}}>{profile.display_name}</h2>
        <p style={{margin:0,color:'#888'}}>@{profile.username}</p>
        {profile.bio && <p style={{marginTop:'10px'}}>{profile.bio}</p>}
        <div style={{display:'flex',gap:'20px',justifyContent:'center',marginTop:'16px'}}>
          <div><strong>{myPosts.length}</strong><br/><small>منشور</small></div>
          <div><strong>0</strong><br/><small>متابع</small></div>
          <div><strong>0</strong><br/><small>يتابع</small></div>
        </div>
      </div>
      <div className="panel" style={{padding:'12px'}}>
        <h3 style={{margin:'0 0 10px'}}>منشوراتي</h3>
        {!myPosts.length ? <p className="muted">لم تنشر شيئاً بعد</p> : <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>{myPosts.map(p=><div key={p.id} style={{padding:'10px',background:'#111',borderRadius:'8px'}}>{p.content.slice(0,100)} - {timeAgo(p.created_at)}</div>)}</div>}
      </div>
      <button className="button secondary" onClick={onSignOut} style={{background:'#1a1a1a',color:'#ef4444',border:'1px solid #333',padding:'12px',borderRadius:'12px',cursor:'pointer'}}>تسجيل خروج</button>
    </div>
  )
}
