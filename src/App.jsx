import React, { useCallback, useEffect, useState, useRef } from 'react'
import { supabase } from './utils/supabase.js'

const PROFILE_FIELDS = 'id,username,display_name,bio,avatar_url,cover_url,is_verified,quiet_mode,created_at'
const POST_FIELDS = 'id,user_id,content,media_urls,media_type,privacy,created_at,likes_count,comments_count,saves_count,reposts_count'
const shortError = (e) => e?.message || 'حدث خطأ'
const timeAgo = (d) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime())/1000))
  if(s<60) return 'الآن'
  if(s<3600) return `منذ ${Math.floor(s/60)} د`
  if(s<86400) return `منذ ${Math.floor(s/3600)} س`
  return `منذ ${Math.floor(s/86400)} ي`
}

// Icons as SVG - outline like screenshot
const IconHome = ({active}) => <svg width="26" height="26" viewBox="0 0 24 24" fill={active?"white":"none"} stroke="white" strokeWidth={active?0:1.8} strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-5H9v5H4a1 1 0 01-1-1V9.5z"/></svg>
const IconVideo = ({active}) => <svg width="26" height="26" viewBox="0 0 24 24" fill={active?"white":"none"} stroke="white" strokeWidth="1.8"><rect x="3" y="5" width="15" height="14" rx="3"/><path d="M18 9l4-2v10l-4-2V9z" fill={active?"white":"none"} stroke="white"/></svg>
const IconMajalis = ({active}) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M3 12a9 9 0 1018 0"/><path d="M6 12a3 3 0 00-3 3v3a3 3 0 003 3h1a1 1 0 001-1v-4a1 1 0 00-1-1H6z"/><path d="M18 12a3 3 0 013 3v3a3 3 0 01-3 3h-1a1 1 0 01-1-1v-4a1 1 0 011-1h1z"/></svg>
const IconMessages = ({active}) => <svg width="26" height="26" viewBox="0 0 24 24" fill={active?"white":"none"} stroke="white" strokeWidth="1.8"><path d="M12 21a9 9 0 01-6.5-2.7L3 21l1.5-3.6A9 9 0 1112 21z" strokeLinejoin="round"/></svg>
const IconSettings = ({active}) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
const IconSearch = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><circle cx="11" cy="11" r="6"/><path d="M21 21l-3.5-3.5"/></svg>
const IconBell = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M6 9a6 6 0 0112 0c0 7 4 9 4 9H2s4-2 4-9"/><path d="M9 21a3 3 0 006 0"/></svg>
const IconUser = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0116 0"/></svg>

export default function App({ session, onSignOut }) {
  const viewerId = session.user.id
  const [profile,setProfile]=useState(null)
  const [posts,setPosts]=useState([])
  const [tab,setTab]=useState('home')
  const [quietMode,setQuietMode]=useState(false)
  const [notice,setNotice]=useState(null)
  const [loading,setLoading]=useState(true)
  const [content,setContent]=useState('')
  const [file,setFile]=useState(null)
  const [busy,setBusy]=useState(false)
  const [showFullComposer,setShowFullComposer]=useState(false)
  const [privacy,setPrivacy]=useState('public')
  const [activePostComments,setActivePostComments]=useState(null)
  const [comments,setComments]=useState([])
  const [commentText,setCommentText]=useState('')
  const [notifCount,setNotifCount]=useState(0)
  const fileRef = useRef(null)

  const notify = useCallback((text,type='info')=>{
    setNotice({text,type}); setTimeout(()=>setNotice(null),3000)
  },[])

  const loadProfile = useCallback(async()=>{
    const { data } = await supabase.from('profiles').select(PROFILE_FIELDS).eq('id',viewerId).maybeSingle()
    if(!data){
      const name = session.user.email?.split('@')[0]||'user'
      const { data: ins } = await supabase.from('profiles').insert({id:viewerId, username:name, display_name:name}).select().single()
      setProfile(ins || {id:viewerId, username:name, display_name:name})
    } else { setProfile(data); setQuietMode(!!data.quiet_mode) }
  },[viewerId, session])

  const loadFeed = useCallback(async()=>{
    setLoading(true)
    try{
      let q = supabase.from('posts').select(POST_FIELDS).order('created_at',{ascending:false}).limit(40)
      if(quietMode){
        const { data: fr } = await supabase.from('friends').select('user_a,user_b').or(`user_a.eq.${viewerId},user_b.eq.${viewerId}`)
        const ids = (fr||[]).map(f=> f.user_a===viewerId?f.user_b:f.user_a)
        if(ids.length) q = q.in('user_id', [...ids, viewerId])
        else q = q.eq('user_id', viewerId)
      }
      const { data } = await q
      const uIds = [...new Set((data||[]).map(p=>p.user_id))]
      const { data: profs } = uIds.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',uIds) : {data:[]}
      const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]))
      const { data: likes } = await supabase.from('likes').select('post_id').eq('user_id',viewerId)
      const liked = new Set((likes||[]).map(l=>l.post_id))
      setPosts((data||[]).map(p=>({...p, profile: map[p.user_id], liked: liked.has(p.id)})))
      const { count } = await supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',viewerId).eq('is_read',false)
      setNotifCount(count||0)
    } catch(e){}
    setLoading(false)
  },[viewerId, quietMode])

  useEffect(()=>{loadProfile()},[loadProfile])
  useEffect(()=>{loadFeed()},[loadFeed])

  const submitPost = async (e)=>{
    e?.preventDefault()
    if(!content.trim() && !file) return
    setBusy(true)
    let path = null
    try{
      if(file){
        const ext = (file.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'')||'jpg'
        const uuid = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()
        path = `${viewerId}/${uuid}.${ext}`
        const { error } = await supabase.storage.from('posts').upload(path, file)
        if(error) throw error
      }
      const { error } = await supabase.from('posts').insert({ user_id: viewerId, content: content.trim() || ' ', media_type: file?'image':'none', media_urls: path?[path]:[], privacy })
      if(error) throw error
      setContent(''); setFile(null); setShowFullComposer(false); if(fileRef.current) fileRef.current.value=''
      notify('تم النشر','success'); loadFeed()
    } catch(err){ if(path) await supabase.storage.from('posts').remove([path]); notify(err.message,'error') } finally{ setBusy(false) }
  }

  const toggleLike = async (post)=>{
    const next = !post.liked
    setPosts(p=>p.map(x=> x.id===post.id ? {...x, liked:next, likes_count: Math.max(0,(x.likes_count||0)+(next?1:-1))} : x))
    if(next) await supabase.from('likes').insert({user_id:viewerId, post_id:post.id})
    else await supabase.from('likes').delete().eq('user_id',viewerId).eq('post_id',post.id)
  }

  const toggleQuiet = async ()=>{
    const next = !quietMode
    setQuietMode(next)
    if(profile) await supabase.from('profiles').update({quiet_mode: next}).eq('id',viewerId)
    notify(next?'الوضع الهادئ: أصدقائك فقط':'الوضع الهادئ متوقف','info')
  }

  const openComments = async (post)=>{
    setActivePostComments(post)
    const { data } = await supabase.from('comments').select('id,content,created_at,user_id').eq('post_id',post.id).order('created_at',{ascending:true})
    const ids = [...new Set((data||[]).map(c=>c.user_id))]
    const { data: profs } = ids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',ids) : {data:[]}
    const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]))
    setComments((data||[]).map(c=>({...c, profile: map[c.user_id]})))
  }
  const sendComment = async (e)=>{
    e.preventDefault()
    if(!commentText.trim() || !activePostComments) return
    await supabase.from('comments').insert({user_id:viewerId, post_id:activePostComments.id, content:commentText.trim()})
    setCommentText(''); openComments(activePostComments); loadFeed()
  }

  return (
    <div dir="rtl" style={{minHeight:'100dvh',background:'#000',color:'#fff',fontFamily:'Cairo, system-ui, sans-serif',paddingBottom:'86px'}}>
      {/* TOP HEADER - زي الصورة بالظبط */}
      <header style={{position:'sticky',top:0,zIndex:30,background:'rgba(0,0,0,0.96)',backdropFilter:'blur(20px)',borderBottom:'1px solid #151515',padding:'10px 14px',paddingTop:'calc(10px + env(safe-area-inset-top,0px))'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:'720px',margin:'0 auto',height:'44px'}}>
          {/* Right side: WANAS + hady + chat icon */}
          <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
            {/* Chat bubble green pill */}
            <div style={{width:'44px',height:'44px',borderRadius:'14px',background:'#16241f',border:'1px solid #1e3a2f',display:'grid',placeItems:'center'}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="1.8"><path d="M12 21a9 9 0 01-6.5-2.7L3 21l1.5-3.6A9 9 0 1112 21z"/></svg>
            </div>
            <span style={{fontWeight:'800',fontSize:'22px',letterSpacing:'0.5px'}}>WANAS</span>
            <button onClick={toggleQuiet} style={{display:'flex',alignItems:'center',gap:'6px',background: quietMode ? '#0f2e26' : '#16241f',color:'#7ee0b9',border:`1px solid ${quietMode?'#10b981':'#1e3a2f'}`,padding:'8px 16px',borderRadius:'20px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7ee0b9" strokeWidth="1.8"><path d="M11 20A7 7 0 0112 4a10 10 0 016 3"/><path d="M11 20a7 7 0 002-14"/><path d="M11 20V4"/></svg>
              هادئ {quietMode && '•'}
            </button>
          </div>
          {/* Left side: profile, bell, search */}
          <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
            <button onClick={()=>setTab('profile')} style={{background:'none',border:'none',cursor:'pointer'}}><IconUser/></button>
            <button onClick={()=>setTab('notifications')} style={{background:'none',border:'none',cursor:'pointer',position:'relative'}}><IconBell/>{notifCount>0 && <span style={{position:'absolute',top:'-4px',right:'-4px',background:'#ef4444',color:'white',fontSize:'10px',minWidth:'16px',height:'16px',borderRadius:'50%',display:'grid',placeItems:'center'}}>{notifCount}</span>}</button>
            <button onClick={()=>setTab('search')} style={{background:'none',border:'none',cursor:'pointer'}}><IconSearch/></button>
            <div style={{width:'32px',height:'32px',borderRadius:'50%',background:'#1a1a1a',border:'1px solid #333',display:'grid',placeItems:'center',fontSize:'12px',fontWeight:'700'}}>{(profile?.display_name?.[0]||'A')+ (profile?.display_name?.[1]||'Z')}</div>
          </div>
        </div>
      </header>

      <main style={{maxWidth:'640px',margin:'0 auto',padding:'14px 12px'}}>
        {notice && <div style={{background: notice.type==='error'?'#381717':'#12301e',color: notice.type==='error'?'#ffd3d3':'#d5ffe4',border:`1px solid ${notice.type==='error'?'#633030':'#285a39'}`,padding:'10px 14px',borderRadius:'12px',marginBottom:'12px',display:'flex',justifyContent:'space-between'}}><span>{notice.text}</span><button onClick={()=>setNotice(null)} style={{background:'none',border:'none',color:'inherit',fontSize:'18px'}}>×</button></div>}

        {tab==='home' && (
          <>
            {/* COMPOSER - زي الصورة بالظبط */}
            <div style={{background:'#121212',border:'1px solid #1e1e1e',borderRadius:'22px',padding:'18px 16px',marginBottom:'14px'}}>
              <div style={{display:'flex',gap:'12px',alignItems:'flex-start'}} onClick={()=>setShowFullComposer(true)}>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:'10px',justifyContent:'flex-start'}}>
                    <div style={{width:'36px',height:'36px',borderRadius:'50%',background:'#1e1e1e',border:'1px solid #333',display:'grid',placeItems:'center'}}><IconUser/></div>
                    <div>
                      <div style={{fontSize:'18px',fontWeight:'700',lineHeight:'1.2'}}>هتونسنا النهارده؟</div>
                      <div style={{fontSize:'13px',color:'#777',marginTop:'4px'}}>شاركنا اللي في بالك...</div>
                    </div>
                  </div>
                </div>
              </div>

              {showFullComposer && (
                <form onSubmit={submitPost} style={{marginTop:'14px'}}>
                  <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="اكتب اللي في بالك..." rows={3} autoFocus style={{width:'100%',background:'#0a0a0a',border:'1px solid #222',borderRadius:'12px',padding:'12px',color:'white',fontSize:'14px',resize:'none',outline:'none'}}/>
                  {file && <div style={{marginTop:'8px',background:'#0a0a0a',padding:'8px 12px',borderRadius:'10px',display:'flex',justifyContent:'space-between',fontSize:'12px'}}><span>🖼️ {file.name}</span><button type="button" onClick={()=>{setFile(null); if(fileRef.current) fileRef.current.value=''}} style={{background:'none',border:'none',color:'white',fontSize:'16px'}}>×</button></div>}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'10px'}}>
                    <select value={privacy} onChange={e=>setPrivacy(e.target.value)} style={{background:'#1a1a1a',color:'#aaa',border:'1px solid #222',borderRadius:'20px',padding:'6px 10px',fontSize:'12px'}}>
                      <option value="public">🌍 عام</option>
                      <option value="friends">👥 الأصدقاء</option>
                      <option value="only_me">🔒 أنا فقط</option>
                    </select>
                    <div style={{display:'flex',gap:'8px'}}>
                      <button type="button" onClick={()=>setShowFullComposer(false)} style={{background:'#1a1a1a',color:'#fff',border:'1px solid #333',padding:'8px 14px',borderRadius:'20px',fontSize:'12px',cursor:'pointer'}}>إلغاء</button>
                      <button type="submit" disabled={busy || (!content.trim() && !file)} style={{background:'white',color:'black',border:'none',padding:'8px 18px',borderRadius:'20px',fontWeight:'700',fontSize:'12px',cursor:'pointer'}}>{busy?'ينشر...':'نشر'}</button>
                    </div>
                  </div>
                </form>
              )}

              {!showFullComposer && (
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:'18px',paddingTop:'14px',borderTop:'1px solid #1e1e1e'}}>
                  <button onClick={()=>fileRef.current?.click()} style={{display:'flex',alignItems:'center',gap:'6px',background:'none',border:'none',color:'#7ee0b9',fontSize:'14px',cursor:'pointer'}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7ee0b9" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-3.5-3.5L3 21"/></svg>
                    صورة
                  </button>
                  <button onClick={()=>notify('الفيديو قريباً','info')} style={{display:'flex',alignItems:'center',gap:'6px',background:'none',border:'none',color:'#aaa',fontSize:'14px',cursor:'pointer'}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.8"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M18 9l4-2v10l-4-2V9z"/></svg>
                    فيديو
                  </button>
                  <button onClick={()=>notify('الصوت قريباً','info')} style={{display:'flex',alignItems:'center',gap:'6px',background:'none',border:'none',color:'#aaa',fontSize:'14px',cursor:'pointer'}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.8"><path d="M12 14a3 3 0 003-3V7a3 3 0 00-6 0v4a3 3 0 003 3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><path d="M12 19v3"/></svg>
                    صوت
                  </button>
                  <button onClick={()=>setShowFullComposer(true)} style={{display:'flex',alignItems:'center',gap:'4px',background:'none',border:'none',color:'#aaa',fontSize:'14px',cursor:'pointer'}}>
                    <span style={{color:'#7ee0b9',fontSize:'18px',fontWeight:'bold'}}>+</span> المزيد
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={e=>{setFile(e.target.files?.[0]||null); if(e.target.files?.[0]) setShowFullComposer(true)}} style={{display:'none'}}/>
                </div>
              )}
            </div>

            {/* FEED */}
            <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
              {loading ? <div style={{background:'#121212',borderRadius:'16px',padding:'20px',textAlign:'center',color:'#777'}}>جارٍ التحميل...</div> :
               !posts.length ? <div style={{background:'#121212',border:'1px solid #1e1e1e',borderRadius:'16px',padding:'30px 20px',textAlign:'center'}}>
                 <p style={{margin:'0 0 8px',fontSize:'15px'}}>لا توجد منشورات بعد. كن أول من يشارك!</p>
                 <p style={{margin:0,fontSize:'12px',color:'#666'}}>💡 فعل الوضع الهادئ يعرض بس منشورات أصدقائك</p>
               </div> :
               posts.map(p=> <PostCard key={p.id} post={p} viewerId={viewerId} onLike={toggleLike} onComment={openComments} />)}
            </div>
          </>
        )}

        {tab==='search' && <SearchView notify={notify} viewerId={viewerId} />}
        {tab==='video' && <div style={{background:'#121212',borderRadius:'16px',padding:'40px 20px',textAlign:'center',color:'#666'}}><IconVideo active={false}/><p style={{marginTop:'12px'}}>فيديو - قريباً</p></div>}
        {tab==='friends' && <FriendsView viewerId={viewerId} notify={notify} />}
        {tab==='messages' && <MessagesView viewerId={viewerId} notify={notify} />}
        {tab==='profile' && profile && <ProfileView profile={profile} posts={posts.filter(p=>p.user_id===viewerId)} onSignOut={onSignOut} onUpdate={loadProfile} notify={notify} />}
        {tab==='notifications' && <NotificationsView viewerId={viewerId} />}
        {tab==='settings' && <SettingsView profile={profile} quietMode={quietMode} onToggleQuiet={toggleQuiet} onSignOut={onSignOut} />}
      </main>

      {/* BOTTOM NAV - 5 أزرار ثابتة زي الصورة بالظبط */}
      <nav style={{position:'fixed',bottom:0,left:0,right:0,zIndex:25,background:'rgba(10,10,10,0.98)',backdropFilter:'blur(20px)',borderTop:'1px solid #1a1a1a',padding:'8px 8px calc(8px + env(safe-area-inset-bottom,0px))',display:'flex',justifyContent:'space-around'}}>
        {[
          ['home','الرئيسية',IconHome],
          ['video','فيديو',IconVideo],
          ['friends','المجالس',IconMajalis],
          ['messages','الرسائل',IconMessages],
          ['settings','الإعدادات',IconSettings],
        ].map(([id,label,Icon])=>{
          const active = tab===id || (id==='home' && tab==='home') || (id==='settings' && tab==='profile')
          return <button key={id} onClick={()=>setTab(id==='settings'?'settings':id)} style={{flex:1,maxWidth:'90px',background: active ? '#1c1c1c' : 'transparent',border:'none',borderRadius:'14px',color: active ? 'white' : '#888',display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',padding:'8px 4px',cursor:'pointer'}}>
            <Icon active={active}/><span style={{fontSize:'11px',fontWeight: active?'600':'400'}}>{label}</span>
          </button>
        })}
      </nav>

      {activePostComments && (
        <div style={{position:'fixed',inset:0,zIndex:60,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
          <div style={{width:'100%',maxWidth:'640px',maxHeight:'80dvh',background:'#121212',borderRadius:'20px 20px 0 0',border:'1px solid #222',display:'flex',flexDirection:'column'}}>
            <div style={{display:'flex',justifyContent:'space-between',padding:'16px',borderBottom:'1px solid #222'}}><strong>التعليقات</strong><button onClick={()=>setActivePostComments(null)} style={{background:'none',border:'none',color:'white',fontSize:'20px',cursor:'pointer'}}>×</button></div>
            <div style={{flex:1,overflowY:'auto',padding:'12px',display:'flex',flexDirection:'column',gap:'10px'}}>
              {comments.map(c=><div key={c.id} style={{display:'flex',gap:'8px'}}><div style={{width:'28px',height:'28px',borderRadius:'50%',background:'#222',display:'grid',placeItems:'center',fontSize:'11px'}}>{c.profile?.display_name?.[0]||'و'}</div><div style={{background:'#1a1a1a',padding:'8px 12px',borderRadius:'12px',flex:1}}><strong style={{fontSize:'12px'}}>{c.profile?.display_name||'مستخدم'}</strong><p style={{margin:'4px 0 0',fontSize:'13px'}}>{c.content}</p></div></div>)}
            </div>
            <form onSubmit={sendComment} style={{display:'flex',gap:'8px',padding:'12px',borderTop:'1px solid #222'}}><input value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder="اكتب تعليقاً..." style={{flex:1,background:'#0a0a0a',border:'1px solid #333',borderRadius:'20px',padding:'10px 14px',color:'white'}}/><button type="submit" style={{background:'white',color:'black',border:'none',padding:'8px 16px',borderRadius:'20px',fontWeight:'700'}}>إرسال</button></form>
          </div>
        </div>
      )}
    </div>
  )
}

function PostCard({ post, viewerId, onLike, onComment }){
  const [mediaSrc,setMediaSrc]=useState('')
  useEffect(()=>{
    const path = post.media_urls?.[0]
    if(!path) return
    if(/^https?:\/\//.test(path)) setMediaSrc(path)
    else supabase.storage.from('posts').createSignedUrl(path,3600).then(({data})=> setMediaSrc(data?.signedUrl||''))
  },[post.media_urls])
  return (
    <div style={{background:'#121212',border:'1px solid #1e1e1e',borderRadius:'18px',padding:'14px'}}>
      <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
        <div style={{width:'36px',height:'36px',borderRadius:'50%',background:'#1e1e1e',display:'grid',placeItems:'center',fontSize:'12px',fontWeight:'700'}}>{post.profile?.display_name?.[0]||'و'}</div>
        <div><div style={{fontSize:'13px',fontWeight:'600'}}>{post.profile?.display_name||post.profile?.username} {post.profile?.is_verified && '✓'}</div><div style={{fontSize:'11px',color:'#777'}}>@{post.profile?.username} · {timeAgo(post.created_at)}</div></div>
      </div>
      {post.content && <p style={{margin:'12px 0 0',fontSize:'14px',lineHeight:'1.7',whiteSpace:'pre-wrap'}}>{post.content}</p>}
      {mediaSrc && <img src={mediaSrc} alt="" style={{width:'100%',borderRadius:'14px',marginTop:'12px',maxHeight:'420px',objectFit:'cover'}}/>}
      <div style={{display:'flex',gap:'12px',marginTop:'12px',paddingTop:'10px',borderTop:'1px solid #1a1a1a'}}>
        <button onClick={()=>onLike(post)} style={{background:'none',border:'none',color: post.liked?'#ff6b7a':'#888',fontSize:'13px',cursor:'pointer'}}>{post.liked?'♥':'♡'} {post.likes_count||0}</button>
        <button onClick={()=>onComment(post)} style={{background:'none',border:'none',color:'#888',fontSize:'13px',cursor:'pointer'}}>💬 {post.comments_count||0}</button>
        <button onClick={()=>{ const url=`${window.location.origin}/post/${post.id}`; navigator.clipboard?.writeText(url) }} style={{background:'none',border:'none',color:'#888',fontSize:'13px',cursor:'pointer'}}>🔗 مشاركة</button>
      </div>
    </div>
  )
}

function SearchView({ notify, viewerId }){
  const [q,setQ]=useState(''); const [users,setUsers]=useState([])
  const search = async (e)=>{
    e.preventDefault()
    if(!q.trim()) return
    const { data } = await supabase.from('profiles').select(PROFILE_FIELDS).or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(15)
    setUsers(data||[])
  }
  const add = async (id)=>{
    const { error } = await supabase.from('friend_requests').insert({from_user:viewerId, to_user:id, status:'pending'})
    if(error) notify(error.message,'error'); else notify('تم إرسال الطلب','success')
  }
  return <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
    <form onSubmit={search} style={{display:'flex',gap:'8px'}}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث عن اسم أو @username" style={{flex:1,background:'#121212',border:'1px solid #222',borderRadius:'20px',padding:'12px 14px',color:'white'}}/><button type="submit" style={{background:'white',color:'black',border:'none',padding:'10px 18px',borderRadius:'20px',fontWeight:'700'}}>بحث</button></form>
    {users.map(u=><div key={u.id} style={{background:'#121212',border:'1px solid #1e1e1e',borderRadius:'14px',padding:'12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}><div style={{display:'flex',gap:'10px',alignItems:'center'}}><div style={{width:'36px',height:'36px',borderRadius:'50%',background:'#222',display:'grid',placeItems:'center'}}>{u.display_name?.[0]}</div><div><strong style={{fontSize:'13px'}}>{u.display_name}</strong><br/><small style={{color:'#777'}}>@{u.username}</small></div></div><button onClick={()=>add(u.id)} style={{background:'#1e1e1e',border:'1px solid #333',color:'white',padding:'6px 12px',borderRadius:'20px',fontSize:'12px',cursor:'pointer'}}>إضافة</button></div>)}
  </div>
}

function FriendsView({ viewerId, notify }){
  const [reqs,setReqs]=useState([]); const [friends,setFriends]=useState([])
  const load = async ()=>{
    const { data: r } = await supabase.from('friend_requests').select('id,from_user,to_user').eq('to_user',viewerId).eq('status','pending')
    const ids = (r||[]).map(x=>x.from_user)
    const { data: profs } = ids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',ids) : {data:[]}
    const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]))
    setReqs((r||[]).map(x=>({...x, profile: map[x.from_user]})))
    const { data: f } = await supabase.from('friends').select('user_a,user_b').or(`user_a.eq.${viewerId},user_b.eq.${viewerId}`)
    const fIds = (f||[]).map(x=> x.user_a===viewerId?x.user_b:x.user_a)
    const { data: fProfs } = fIds.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',fIds) : {data:[]}
    setFriends(fProfs||[])
  }
  useEffect(()=>{load()},[])
  return <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
    <div style={{background:'#121212',borderRadius:'14px',padding:'16px'}}><h3 style={{margin:'0 0 12px'}}>طلبات الصداقة ({reqs.length})</h3>{!reqs.length ? <p style={{color:'#666',fontSize:'13px'}}>لا توجد طلبات</p> : reqs.map(r=><div key={r.id} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #1a1a1a'}}><span>{r.profile?.display_name}</span><div style={{display:'flex',gap:'6px'}}><button onClick={async()=>{ const a=viewerId<r.from_user?viewerId:r.from_user; const b=viewerId<r.from_user?r.from_user:viewerId; await supabase.from('friends').insert({user_a:a,user_b:b}); await supabase.from('friend_requests').update({status:'accepted'}).eq('id',r.id); load() }} style={{background:'#10b981',border:'none',padding:'6px 12px',borderRadius:'20px',color:'white',cursor:'pointer'}}>قبول</button><button onClick={async()=>{ await supabase.from('friend_requests').update({status:'declined'}).eq('id',r.id); load() }} style={{background:'#222',border:'none',padding:'6px 12px',borderRadius:'20px',color:'white',cursor:'pointer'}}>رفض</button></div></div>)}</div>
    <div style={{background:'#121212',borderRadius:'14px',padding:'16px'}}><h3 style={{margin:'0 0 12px'}}>أصدقائي ({friends.length})</h3><div style={{display:'flex',flexWrap:'wrap',gap:'12px'}}>{friends.map(f=><div key={f.id} style={{textAlign:'center'}}><div style={{width:'48px',height:'48px',borderRadius:'50%',background:'#222',display:'grid',placeItems:'center'}}>{f.display_name?.[0]}</div><small style={{fontSize:'11px'}}>{f.display_name}</small></div>)}</div></div>
  </div>
}

function MessagesView({ viewerId }){
  return <div style={{background:'#121212',borderRadius:'14px',padding:'40px 20px',textAlign:'center',color:'#666'}}><div style={{fontSize:'32px'}}>💬</div><p>الرسائل - افتح من اكتشف وأضف صديق ثم راسله</p></div>
}
function NotificationsView({ viewerId }){
  const [notifs,setNotifs]=useState([])
  useEffect(()=>{ supabase.from('notifications').select('id,type,created_at,from_user').eq('user_id',viewerId).order('created_at',{ascending:false}).limit(20).then(async ({data})=>{ const ids=[...new Set((data||[]).map(n=>n.from_user).filter(Boolean))]; const {data:profs}= ids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',ids) : {data:[]}; const map=Object.fromEntries((profs||[]).map(p=>[p.id,p])); setNotifs((data||[]).map(n=>({...n, from_profile: map[n.from_user]}))); if((data||[]).length) supabase.from('notifications').update({is_read:true}).eq('user_id',viewerId) }) },[viewerId])
  return <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>{!notifs.length ? <div style={{background:'#121212',borderRadius:'14px',padding:'20px',textAlign:'center',color:'#666'}}>لا توجد إشعارات</div> : notifs.map(n=><div key={n.id} style={{background:'#121212',borderRadius:'12px',padding:'12px',display:'flex',gap:'10px'}}><div style={{width:'32px',height:'32px',borderRadius:'50%',background:'#222',display:'grid',placeItems:'center'}}>{n.from_profile?.display_name?.[0]||'و'}</div><div><p style={{margin:0,fontSize:'13px'}}><strong>{n.from_profile?.display_name||'مستخدم'}</strong> {n.type==='like'?'أعجب بمنشورك': n.type==='comment'?'علق على منشورك':'أرسل طلب صداقة'}</p><small style={{color:'#666'}}>{timeAgo(n.created_at)}</small></div></div>)}</div>
}
function ProfileView({ profile, posts, onSignOut, onUpdate, notify }){
  const [edit,setEdit]=useState(false); const [name,setName]=useState(profile.display_name||''); const [bio,setBio]=useState(profile.bio||'')
  return <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
    <div style={{background:'#121212',borderRadius:'16px',padding:'20px',textAlign:'center'}}>
      <div style={{width:'72px',height:'72px',borderRadius:'50%',background:'#222',margin:'0 auto 12px',display:'grid',placeItems:'center',fontSize:'24px',fontWeight:'700'}}>{profile.display_name?.[0]||'و'}</div>
      <h2 style={{margin:'0 0 4px'}}>{profile.display_name}</h2><p style={{margin:0,color:'#666'}}>@{profile.username}</p>
      {profile.bio && <p style={{marginTop:'12px',fontSize:'13px',color:'#aaa'}}>{profile.bio}</p>}
      <div style={{display:'flex',gap:'20px',justifyContent:'center',marginTop:'16px'}}><div><strong>{posts.length}</strong><br/><small style={{color:'#666'}}>منشور</small></div></div>
      {!edit ? <button onClick={()=>setEdit(true)} style={{marginTop:'16px',background:'#1e1e1e',border:'1px solid #333',color:'white',padding:'8px 16px',borderRadius:'20px',cursor:'pointer'}}>تعديل الملف</button> :
       <div style={{marginTop:'16px',display:'flex',flexDirection:'column',gap:'8px'}}><input value={name} onChange={e=>setName(e.target.value)} placeholder="الاسم" style={{background:'#0a0a0a',border:'1px solid #333',borderRadius:'10px',padding:'10px',color:'white'}}/><textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="النبذة" rows={2} style={{background:'#0a0a0a',border:'1px solid #333',borderRadius:'10px',padding:'10px',color:'white'}}/><div style={{display:'flex',gap:'8px',justifyContent:'center'}}><button onClick={async()=>{ const {error}=await supabase.from('profiles').update({display_name:name,bio}).eq('id',profile.id); if(error) notify(error.message,'error'); else { notify('تم الحفظ','success'); setEdit(false); onUpdate() } }} style={{background:'white',color:'black',border:'none',padding:'8px 16px',borderRadius:'20px',cursor:'pointer'}}>حفظ</button><button onClick={()=>setEdit(false)} style={{background:'#222',border:'none',color:'white',padding:'8px 16px',borderRadius:'20px',cursor:'pointer'}}>إلغاء</button></div></div>}
    </div>
    <button onClick={onSignOut} style={{background:'#1a1a1a',border:'1px solid #333',color:'#fff',padding:'12px',borderRadius:'12px',cursor:'pointer'}}>تسجيل خروج</button>
    <div style={{textAlign:'center',fontSize:'10px',color:'#444',padding:'12px'}}>تم بناء برمجة هذا البرنامج بواسطة ABD.ALLAH ZOHAIR OMARA<br/>WANAS</div>
  </div>
}
function SettingsView({ profile, quietMode, onToggleQuiet, onSignOut }){
  return <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
    <div style={{background:'#121212',borderRadius:'14px',padding:'16px'}}>
      <h3 style={{margin:'0 0 12px'}}>الإعدادات</h3>
      <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid #1a1a1a'}}><span>الوضع الهادئ 🌿</span><button onClick={onToggleQuiet} style={{background: quietMode?'#10b981':'#333',border:'none',color:'white',padding:'6px 14px',borderRadius:'20px',cursor:'pointer'}}>{quietMode?'مفعل':'متوقف'}</button></div>
      <div style={{padding:'12px 0',fontSize:'13px'}}><a href="/privacy.html" style={{color:'#888',textDecoration:'none'}}>سياسة الخصوصية</a> · <a href="/terms.html" style={{color:'#888',textDecoration:'none'}}>شروط الاستخدام</a></div>
    </div>
    <div style={{background:'#121212',borderRadius:'14px',padding:'16px',textAlign:'center',fontSize:'11px',color:'#555'}}>تم بناء برمجة هذا البرنامج بواسطة ABD.ALLAH ZOHAIR OMARA<br/>WANAS v1.0 - app.wanas.social</div>
  </div>
}
