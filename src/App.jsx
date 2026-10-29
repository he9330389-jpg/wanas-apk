import React, { useCallback, useEffect, useState, useRef } from 'react'
import { supabase } from './utils/supabase.js'

const PROFILE_FIELDS = 'id,username,display_name,bio,avatar_url,cover_url,is_verified,quiet_mode,created_at'
const POST_FIELDS = 'id,user_id,content,media_urls,media_type,privacy,comment_setting,created_at,likes_count,comments_count,saves_count,reposts_count'

// Helpers
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
  if(profile?.avatar_url) return <img className={cls} src={profile.avatar_url} alt={name} style={{width:size==='sm'?32:size==='md'?40:56,height:size==='sm'?32:size==='md'?40:56,borderRadius:'50%',objectFit:'cover'}}/>
  return <span className={`${cls} avatar-fallback`} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:size==='sm'?32:size==='md'?40:56,height:size==='sm'?32:size==='md'?40:56,borderRadius:'50%',background:'#1f1f1f',color:'#fff',fontWeight:'bold'}}>{initials(name)}</span>
}

// HEADER
function AppHeader({ profile, quietMode, onToggleQuiet, setTab, notifCount, msgCount }){
  return (
    <header className="app-header" style={{position:'sticky',top:0,zIndex:20,background:'#0a0a0a',borderBottom:'1px solid #1a1a1a',padding:'10px 14px'}}>
      <div className="header-inner" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div className="brand-lockup" onClick={()=>setTab('home')} style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'8px',fontWeight:'900',fontSize:'22px'}}>
          <div className="brand-mark" style={{width:'32px',height:'32px',background:'white',color:'black',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center'}}>و</div><span>WANAS</span>
        </div>
        <div className="header-actions" style={{display:'flex',alignItems:'center',gap:'10px'}}>
          <button onClick={onToggleQuiet} style={{background: quietMode?'#065f46':'#102a22',color:'#5eead4',padding:'6px 12px',borderRadius:'20px',fontSize:'12px',border:'none',cursor:'pointer'}}>🌿 هادئ</button>
          <button onClick={()=>setTab('search')} style={{background:'none',border:'none',color:'#fff',fontSize:'18px',cursor:'pointer'}}>⌕</button>
          <button onClick={()=>setTab('messages')} style={{background:'none',border:'none',color:'#fff',fontSize:'18px',cursor:'pointer',position:'relative'}}>✉{msgCount>0 && <span style={{position:'absolute',top:'-4px',right:'-4px',background:'#10b981',color:'white',fontSize:'9px',width:'16px',height:'16px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center'}}>{msgCount}</span>}</button>
          <button onClick={()=>setTab('notifications')} style={{background:'none',border:'none',color:'#fff',fontSize:'18px',cursor:'pointer',position:'relative'}}>🔔{notifCount>0 && <span style={{position:'absolute',top:'-4px',right:'-4px',background:'#ef4444',color:'white',fontSize:'9px',width:'16px',height:'16px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center'}}>{notifCount}</span>}</button>
          <button onClick={()=>setTab('profile')} style={{background:'none',border:'none',padding:0,cursor:'pointer'}}><Avatar profile={profile} size="sm"/></button>
        </div>
      </div>
    </header>
  )
}

// STORIES RAIL
function StoriesRail({ viewerId, onNotify }){
  const [stories,setStories]=useState([])
  const [myStoryFile,setMyStoryFile]=useState(null)
  useEffect(()=>{
    supabase.from('stories').select('id,user_id,media_url,expires_at,created_at').gt('expires_at', new Date().toISOString()).order('created_at',{ascending:false}).limit(20).then(async ({data})=>{
      const ids = [...new Set((data||[]).map(s=>s.user_id))]
      const { data: profs } = ids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',ids) : {data:[]}
      const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]))
      setStories((data||[]).map(s=>({...s, profile: map[s.user_id]})))
    })
  },[])
  const uploadStory = async (e)=>{
    const file = e.target.files?.[0]; if(!file) return
    try{
      const ext = file.name.split('.').pop()||'jpg'
      const path = `${viewerId}/stories/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('posts').upload(path, file)
      if(error) throw error
      const { error: dbErr } = await supabase.from('stories').insert({ user_id: viewerId, media_url: path })
      if(dbErr) throw dbErr
      onNotify('تم نشر القصة','success')
      setTimeout(()=>window.location.reload(),500)
    }catch(err){ onNotify(shortError(err),'error') }
  }
  return (
    <div style={{display:'flex',gap:'12px',overflowX:'auto',padding:'12px 4px'}}>
      <label style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',cursor:'pointer',minWidth:'60px'}}>
        <div style={{width:'56px',height:'56px',borderRadius:'50%',background:'#1a1a1a',border:'2px dashed #333',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'24px'}}>+</div>
        <small style={{fontSize:'10px'}}>قصتي</small>
        <input type="file" accept="image/*,video/*" onChange={uploadStory} style={{display:'none'}}/>
      </label>
      {stories.map(s=>(
        <div key={s.id} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',minWidth:'60px'}}>
          <img src={s.profile?.avatar_url || ''} alt="" style={{width:'56px',height:'56px',borderRadius:'50%',border:'2px solid #10b981',objectFit:'cover',background:'#222'}}/>
          <small style={{fontSize:'10px',maxWidth:'60px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.profile?.username||'مستخدم'}</small>
        </div>
      ))}
    </div>
  )
}

// COMPOSER
function Composer({ profile, onCreated, notify }){
  const [content,setContent] = useState('')
  const [privacy,setPrivacy]=useState('public')
  const [file,setFile] = useState(null)
  const [busy,setBusy] = useState(false)
  const inputRef = useRef(null)

  const submit = async (e)=>{
    e.preventDefault()
    if(!content.trim() && !file) return
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
      const { error } = await supabase.from('posts').insert({ user_id: profile.id, content: content.trim() || ' ', media_type: file?'image':'none', media_urls: path?[path]:[], privacy })
      if(error) throw error
      setContent(''); setFile(null); if(inputRef.current) inputRef.current.value=''
      notify('تم النشر','success'); onCreated()
    }catch(err){ if(path) await supabase.storage.from('posts').remove([path]); notify(shortError(err),'error') } finally{ setBusy(false) }
  }

  return (
    <form className="panel composer" onSubmit={submit} style={{background:'#111',border:'1px solid #222',borderRadius:'16px',padding:'12px'}}>
      <div className="composer-top" style={{display:'flex',gap:'10px'}}><Avatar profile={profile}/><textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="هتونسنا النهارده؟ شاركنا اللي في بالك..." maxLength={5000} rows={3} style={{flex:1,background:'#0a0a0a',border:'1px solid #222',borderRadius:'12px',padding:'10px',color:'white',resize:'none'}}/></div>
      {file && <div className="file-chip" style={{marginTop:'8px',background:'#0a0a0a',padding:'6px 10px',borderRadius:'8px',display:'flex',justifyContent:'space-between'}}><span>🖼️ {file.name}</span><button type="button" onClick={()=>{setFile(null); if(inputRef.current) inputRef.current.value=''}}>×</button></div>}
      <div className="composer-footer" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'10px'}}>
        <div className="composer-options" style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <button type="button" className="subtle-button" onClick={()=>inputRef.current?.click()} style={{background:'#1a1a1a',border:'none',color:'#fff',padding:'6px 10px',borderRadius:'20px',cursor:'pointer'}}>🖼️ صورة</button>
          <select value={privacy} onChange={e=>setPrivacy(e.target.value)} style={{background:'#1a1a1a',border:'none',color:'#fff',padding:'6px 10px',borderRadius:'20px'}}>
            <option value="public">🌍 عام</option>
            <option value="friends">👥 الأصدقاء</option>
            <option value="only_me">🔒 أنا فقط</option>
          </select>
          <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)} style={{display:'none'}}/>
        </div>
        <button className="button primary compact" disabled={busy || (!content.trim() && !file)} style={{background:'white',color:'black',border:'none',padding:'8px 18px',borderRadius:'20px',fontWeight:'bold',cursor:'pointer'}}>{busy?'جارٍ النشر…':'نشر'}</button>
      </div>
    </form>
  )
}

// POST ITEM
function PostItem({ post, viewerId, onLike, onSave, onRepost, onDelete, onEdit, onOpenComments, onShare, onReport, onBlock }){
  const [mediaSrc,setMediaSrc]=useState('')
  const [menu,setMenu]=useState(false)
  const path = post.media_urls?.[0]
  useEffect(()=>{
    if(!path) return
    if(/^https?:\/\//i.test(path)) setMediaSrc(path)
    else supabase.storage.from('posts').createSignedUrl(path,3600).then(({data})=> setMediaSrc(data?.signedUrl||''))
  },[path])

  return (
    <article className="panel post-item" style={{background:'#111',border:'1px solid #1a1a1a',borderRadius:'16px',padding:'12px',position:'relative'}}>
      <div className="post-head" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex',gap:'11px',alignItems:'center',flex:1}}>
          <Avatar profile={post.profile}/><div className="post-author" style={{display:'flex',flexDirection:'column'}}><strong style={{fontSize:'14px'}}>{post.profile?.display_name||post.profile?.username||'مستخدم'} {post.profile?.is_verified && '✓'}</strong><span style={{fontSize:'11px',color:'#888'}}>@{post.profile?.username} · {timeAgo(post.created_at)} · {post.privacy==='public'?'🌍':post.privacy==='friends'?'👥':'🔒'}</span></div>
        </div>
        <button onClick={()=>setMenu(!menu)} style={{background:'none',border:'none',color:'#888',cursor:'pointer',fontSize:'18px'}}>⋯</button>
        {menu && (
          <div style={{position:'absolute',top:'40px',left:'12px',background:'#1a1a1a',border:'1px solid #333',borderRadius:'12px',padding:'8px',zIndex:10,minWidth:'160px',display:'flex',flexDirection:'column',gap:'4px'}}>
            {post.user_id===viewerId ? <>
              <button onClick={()=>{setMenu(false); onEdit(post)}} style={{background:'none',border:'none',color:'#fff',textAlign:'right',padding:'6px',cursor:'pointer'}}>✏️ تعديل</button>
              <button onClick={()=>{setMenu(false); onDelete(post)}} style={{background:'none',border:'none',color:'#ef4444',textAlign:'right',padding:'6px',cursor:'pointer'}}>🗑️ حذف</button>
            </> : <>
              <button onClick={()=>{setMenu(false); onReport(post)}} style={{background:'none',border:'none',color:'#fff',textAlign:'right',padding:'6px',cursor:'pointer'}}>🚩 إبلاغ</button>
              <button onClick={()=>{setMenu(false); onBlock(post)}} style={{background:'none',border:'none',color:'#ef4444',textAlign:'right',padding:'6px',cursor:'pointer'}}>🚫 حظر المستخدم</button>
            </>}
          </div>
        )}
      </div>
      {post.content?.trim() && <p className="post-content" style={{margin:'10px 0',whiteSpace:'pre-wrap'}}>{post.content}</p>}
      {mediaSrc && <img className="post-media" src={mediaSrc} alt="مرفق" style={{width:'100%',borderRadius:'12px',marginTop:'8px',maxHeight:'400px',objectFit:'cover'}}/>}
      <div className="post-actions" style={{display:'flex',gap:'8px',marginTop:'12px',borderTop:'1px solid #1a1a1a',paddingTop:'10px'}}>
        <button onClick={()=>onLike(post)} style={{flex:1,background: post.liked?'#1f0f0f':'#0a0a0a',border:'1px solid #222',color: post.liked ? '#ef4444' : '#9ca3af',cursor:'pointer',padding:'8px',borderRadius:'20px',fontSize:'13px'}}>{post.liked?'♥':'♡'} {post.likes_count||0}</button>
        <button onClick={()=>onOpenComments(post)} style={{flex:1,background:'#0a0a0a',border:'1px solid #222',color:'#9ca3af',cursor:'pointer',padding:'8px',borderRadius:'20px',fontSize:'13px'}}>💬 {post.comments_count||0}</button>
        <button onClick={()=>onSave(post)} style={{flex:1,background: post.saved?'#0f1f0f':'#0a0a0a',border:'1px solid #222',color: post.saved?'#10b981':'#9ca3af',cursor:'pointer',padding:'8px',borderRadius:'20px',fontSize:'13px'}}>🔖 {post.saves_count||0}</button>
        <button onClick={()=>onRepost(post)} style={{flex:1,background: post.reposted?'#0f1f0f':'#0a0a0a',border:'1px solid #222',color: post.reposted?'#10b981':'#9ca3af',cursor:'pointer',padding:'8px',borderRadius:'20px',fontSize:'13px'}}>↻ {post.reposts_count||0}</button>
        <button onClick={()=>onShare(post)} style={{flex:1,background:'#0a0a0a',border:'1px solid #222',color:'#9ca3af',cursor:'pointer',padding:'8px',borderRadius:'20px',fontSize:'13px'}}>🔗</button>
      </div>
    </article>
  )
}

function CommentsSheet({ post, viewerProfile, onClose, notify, onCommentAdded }){
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
      setText(''); load(); onCommentAdded()
    }catch(err){ notify(shortError(err),'error') }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:100,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div className="panel" style={{width:'100%',maxWidth:'600px',maxHeight:'80vh',borderRadius:'20px 20px 0 0',display:'flex',flexDirection:'column',background:'#111'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px',borderBottom:'1px solid #222'}}>
          <strong>التعليقات ({post.comments_count||0})</strong>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer',color:'#fff'}}>×</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:'12px'}}>
          {loading ? <div className="muted">جارٍ التحميل...</div> :
           !comments.length ? <div className="muted">لا توجد تعليقات بعد</div> :
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
          <input value={text} onChange={e=>setText(e.target.value)} placeholder="اكتب تعليقاً..." style={{flex:1,background:'#0a0a0a',border:'1px solid #333',borderRadius:'20px',padding:'10px 14px',color:'white'}}/>
          <button type="submit" disabled={!text.trim()} style={{background:'white',color:'black',border:'none',padding:'8px 16px',borderRadius:'20px',cursor:'pointer'}}>إرسال</button>
        </form>
      </div>
    </div>
  )
}

// SEARCH TAB
function SearchTab({ notify }){
  const [q,setQ]=useState('')
  const [users,setUsers]=useState([])
  const [busy,setBusy]=useState(false)
  const doSearch = async (e)=>{
    e?.preventDefault()
    if(!q.trim()) return
    setBusy(true)
    const { data } = await supabase.from('profiles').select(PROFILE_FIELDS).or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(20)
    setUsers(data||[]); setBusy(false)
  }
  const sendFriendReq = async (toUser)=>{
    try{
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('friend_requests').insert({ from_user: user.id, to_user: toUser })
      if(error) throw error
      notify('تم إرسال طلب الصداقة','success')
    }catch(err){ notify(shortError(err),'error') }
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
      <form onSubmit={doSearch} style={{display:'flex',gap:'8px'}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث عن اسم أو @username" style={{flex:1,background:'#111',border:'1px solid #333',borderRadius:'20px',padding:'12px 14px',color:'white'}}/>
        <button type="submit" style={{background:'white',color:'black',border:'none',padding:'10px 18px',borderRadius:'20px',cursor:'pointer'}}>{busy?'...':'بحث'}</button>
      </form>
      <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
        {users.map(u=>(
          <div key={u.id} style={{background:'#111',border:'1px solid #1a1a1a',borderRadius:'12px',padding:'12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{display:'flex',gap:'10px',alignItems:'center'}}><Avatar profile={u}/><div><strong>{u.display_name}</strong><br/><small style={{color:'#888'}}>@{u.username}</small></div></div>
            <button onClick={()=>sendFriendReq(u.id)} style={{background:'#1a1a1a',border:'1px solid #333',color:'white',padding:'6px 12px',borderRadius:'20px',cursor:'pointer'}}>إضافة</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// FRIENDS TAB
function FriendsTab({ viewerId, notify }){
  const [reqs,setReqs]=useState([])
  const [friends,setFriends]=useState([])
  const load = async ()=>{
    const { data: r } = await supabase.from('friend_requests').select('id,from_user,to_user,status,created_at').or(`from_user.eq.${viewerId},to_user.eq.${viewerId}`).eq('status','pending').order('created_at',{ascending:false})
    const allIds = [...new Set((r||[]).flatMap(x=>[x.from_user,x.to_user]))]
    const { data: profs } = allIds.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',allIds) : {data:[]}
    const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]))
    setReqs((r||[]).map(x=>({...x, from_profile: map[x.from_user], to_profile: map[x.to_user]})))
    const { data: f } = await supabase.from('friends').select('id,user_a,user_b').or(`user_a.eq.${viewerId},user_b.eq.${viewerId}`)
    const fIds = (f||[]).map(x=> x.user_a===viewerId ? x.user_b : x.user_a)
    const { data: fProfs } = fIds.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',fIds) : {data:[]}
    setFriends(fProfs||[])
  }
  useEffect(()=>{ load() },[])
  const accept = async (req)=>{
    const other = req.from_user===viewerId ? req.to_user : req.from_user
    const a = viewerId < other ? viewerId : other
    const b = viewerId < other ? other : viewerId
    await supabase.from('friends').insert({ user_a: a, user_b: b })
    await supabase.from('friend_requests').update({ status:'accepted' }).eq('id', req.id)
    notify('تم قبول الصداقة','success'); load()
  }
  const decline = async (id)=>{ await supabase.from('friend_requests').update({ status:'declined' }).eq('id',id); load() }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
      <div><h3>طلبات الصداقة ({reqs.length})</h3>{!reqs.length ? <p style={{color:'#888'}}>لا توجد طلبات</p> : reqs.map(r=>(
        <div key={r.id} style={{background:'#111',border:'1px solid #1a1a1a',borderRadius:'12px',padding:'12px',display:'flex',justifyContent:'space-between',marginBottom:'8px'}}>
          <div style={{display:'flex',gap:'10px',alignItems:'center'}}><Avatar profile={r.from_user===viewerId?r.to_profile:r.from_profile}/><span>{r.from_user===viewerId?`أرسلت إلى ${r.to_profile?.display_name}`:`${r.from_profile?.display_name} يريد صداقتك`}</span></div>
          {r.to_user===viewerId && <div style={{display:'flex',gap:'6px'}}><button onClick={()=>accept(r)} style={{background:'#10b981',border:'none',padding:'6px 12px',borderRadius:'20px',cursor:'pointer'}}>قبول</button><button onClick={()=>decline(r.id)} style={{background:'#222',border:'none',padding:'6px 12px',borderRadius:'20px',cursor:'pointer',color:'white'}}>رفض</button></div>}
        </div>
      ))}</div>
      <div><h3>الأصدقاء ({friends.length})</h3><div style={{display:'flex',flexWrap:'wrap',gap:'12px'}}>{friends.map(f=><div key={f.id} style={{textAlign:'center'}}><Avatar profile={f}/><br/><small>{f.display_name}</small></div>)}</div></div>
    </div>
  )
}

// MESSAGES TAB
function MessagesTab({ viewerId, notify }){
  const [convs,setConvs]=useState([])
  const [active,setActive]=useState(null)
  const [msgs,setMsgs]=useState([])
  const [text,setText]=useState('')
  const loadConvs = async ()=>{
    const { data } = await supabase.from('messages').select('id,from_user,to_user,content,created_at').or(`from_user.eq.${viewerId},to_user.eq.${viewerId}`).order('created_at',{ascending:false}).limit(100)
    const otherIds = [...new Set((data||[]).map(m=> m.from_user===viewerId?m.to_user:m.from_user))]
    const { data: profs } = otherIds.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',otherIds) : {data:[]}
    const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]))
    const grouped = {}
    ;(data||[]).forEach(m=>{
      const other = m.from_user===viewerId?m.to_user:m.from_user
      if(!grouped[other]) grouped[other]= { other, profile: map[other], last: m, count:0 }
    })
    setConvs(Object.values(grouped))
  }
  const loadMsgs = async (otherId)=>{
    setActive(otherId)
    const { data } = await supabase.from('messages').select('id,from_user,to_user,content,created_at').or(`and(from_user.eq.${viewerId},to_user.eq.${otherId}),and(from_user.eq.${otherId},to_user.eq.${viewerId})`).order('created_at',{ascending:true}).limit(100)
    setMsgs(data||[])
  }
  const send = async (e)=>{
    e.preventDefault(); if(!text.trim() || !active) return
    const { error } = await supabase.from('messages').insert({ from_user: viewerId, to_user: active, content: text.trim() })
    if(error) return notify(shortError(error),'error')
    setText(''); loadMsgs(active)
  }
  useEffect(()=>{ loadConvs(); const id=setInterval(loadConvs,5000); return ()=>clearInterval(id) },[])
  useEffect(()=>{ if(active){ const id=setInterval(()=>loadMsgs(active),3000); return ()=>clearInterval(id) } },[active])

  if(active){
    const otherProfile = convs.find(c=>c.other===active)?.profile
    return (
      <div style={{display:'flex',flexDirection:'column',height:'70vh'}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',padding:'12px',borderBottom:'1px solid #222'}}><button onClick={()=>setActive(null)} style={{background:'none',border:'none',color:'white',fontSize:'20px',cursor:'pointer'}}>‹</button><Avatar profile={otherProfile} size="sm"/><strong>{otherProfile?.display_name||'محادثة'}</strong></div>
        <div style={{flex:1,overflowY:'auto',padding:'12px',display:'flex',flexDirection:'column',gap:'8px'}}>
          {msgs.map(m=><div key={m.id} style={{alignSelf: m.from_user===viewerId?'flex-end':'flex-start',background: m.from_user===viewerId?'white':'#1a1a1a',color: m.from_user===viewerId?'black':'white',padding:'8px 12px',borderRadius:'16px',maxWidth:'70%'}}>{m.content}</div>)}
        </div>
        <form onSubmit={send} style={{display:'flex',gap:'8px',padding:'12px',borderTop:'1px solid #222'}}><input value={text} onChange={e=>setText(e.target.value)} placeholder="اكتب رسالة..." style={{flex:1,background:'#0a0a0a',border:'1px solid #333',borderRadius:'20px',padding:'10px 14px',color:'white'}}/><button type="submit" style={{background:'white',color:'black',border:'none',padding:'8px 16px',borderRadius:'20px',cursor:'pointer'}}>إرسال</button></form>
      </div>
    )
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
      {!convs.length ? <div style={{background:'#111',borderRadius:'12px',padding:'20px',textAlign:'center',color:'#888'}}>لا توجد محادثات. ابحث عن أصدقاء وابدأ محادثة!</div> :
       convs.map(c=>(
        <div key={c.other} onClick={()=>loadMsgs(c.other)} style={{background:'#111',border:'1px solid #1a1a1a',borderRadius:'12px',padding:'12px',display:'flex',gap:'10px',alignItems:'center',cursor:'pointer'}}>
          <Avatar profile={c.profile}/><div style={{flex:1}}><strong>{c.profile?.display_name||'مستخدم'}</strong><br/><small style={{color:'#888'}}>{c.last.content.slice(0,40)}</small></div><small style={{color:'#666'}}>{timeAgo(c.last.created_at)}</small>
        </div>
      ))}
    </div>
  )
}

// NOTIFICATIONS
function NotificationsTab({ viewerId }){
  const [notifs,setNotifs]=useState([])
  useEffect(()=>{
    supabase.from('notifications').select('id,type,created_at,from_user,post_id').eq('user_id',viewerId).order('created_at',{ascending:false}).limit(50).then(async ({data})=>{
      const ids = [...new Set((data||[]).map(n=>n.from_user).filter(Boolean))]
      const { data: profs } = ids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',ids) : {data:[]}
      const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]))
      setNotifs((data||[]).map(n=>({...n, from_profile: map[n.from_user]})))
      if((data||[]).length) supabase.from('notifications').update({is_read:true}).eq('user_id',viewerId)
    })
  },[viewerId])
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
      {!notifs.length ? <div style={{background:'#111',borderRadius:'12px',padding:'20px',textAlign:'center',color:'#888'}}>لا توجد إشعارات</div> : notifs.map(n=>(
        <div key={n.id} style={{background:'#111',border:'1px solid #1a1a1a',borderRadius:'12px',padding:'12px',display:'flex',gap:'10px',alignItems:'center'}}>
          <Avatar profile={n.from_profile} size="sm"/>
          <div style={{flex:1}}><p style={{margin:0,fontSize:'14px'}}><strong>{n.from_profile?.display_name||'مستخدم'}</strong> {n.type==='like'?'أعجب بمنشورك': n.type==='comment'?'علق على منشورك': n.type==='friend_request'?'أرسل طلب صداقة':'تفاعل معك'}</p><small style={{color:'#666'}}>{timeAgo(n.created_at)}</small></div>
        </div>
      ))}
    </div>
  )
}

// PROFILE
function ProfileTab({ profile, myPosts, onUpdate, onSignOut, notify }){
  const [edit,setEdit]=useState(false)
  const [displayName,setDisplayName]=useState(profile.display_name||'')
  const [bio,setBio]=useState(profile.bio||'')
  const [avatarFile,setAvatarFile]=useState(null)
  const save = async ()=>{
    try{
      let avatar_url = profile.avatar_url
      if(avatarFile){
        const ext = avatarFile.name.split('.').pop()||'jpg'
        const path = `${profile.id}/avatar.${ext}`
        const { error } = await supabase.storage.from('posts').upload(path, avatarFile, { upsert:true })
        if(error) throw error
        const { data } = supabase.storage.from('posts').getPublicUrl(path)
        avatar_url = data.publicUrl
      }
      const { error } = await supabase.from('profiles').update({ display_name: displayName, bio, avatar_url }).eq('id', profile.id)
      if(error) throw error
      notify('تم تحديث الملف','success'); setEdit(false); onUpdate()
    }catch(err){ notify(shortError(err),'error') }
  }
  const deleteAccount = async ()=>{
    if(!confirm('هل أنت متأكد؟ سيتم حذف حسابك نهائياً وجميع بياناتك!')) return
    const { error } = await supabase.rpc('delete_my_account')
    if(error){ notify(shortError(error),'error'); return }
    await supabase.auth.signOut()
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
      <div style={{background:'#111',border:'1px solid #1a1a1a',borderRadius:'16px',padding:'20px',textAlign:'center'}}>
        <div style={{display:'flex',justifyContent:'center',marginBottom:'12px',position:'relative'}}>
          <Avatar profile={profile} size="md"/>
          {edit && <label style={{position:'absolute',bottom:'-6px',background:'#fff',color:'#000',fontSize:'10px',padding:'2px 6px',borderRadius:'10px',cursor:'pointer'}}>تغيير<input type="file" accept="image/*" onChange={e=>setAvatarFile(e.target.files?.[0])} style={{display:'none'}}/></label>}
        </div>
        {!edit ? <>
          <h2 style={{margin:'0 0 4px'}}>{profile.display_name} {profile.is_verified && '✓'}</h2>
          <p style={{margin:0,color:'#888'}}>@{profile.username}</p>
          {profile.bio && <p style={{marginTop:'10px'}}>{profile.bio}</p>}
          <button onClick={()=>setEdit(true)} style={{marginTop:'12px',background:'#1a1a1a',border:'1px solid #333',color:'white',padding:'8px 16px',borderRadius:'20px',cursor:'pointer'}}>تعديل الملف</button>
        </> : <>
          <input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="الاسم الظاهر" style={{width:'100%',background:'#0a0a0a',border:'1px solid #333',borderRadius:'10px',padding:'10px',color:'white',marginBottom:'8px'}}/>
          <textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="النبذة" rows={3} style={{width:'100%',background:'#0a0a0a',border:'1px solid #333',borderRadius:'10px',padding:'10px',color:'white',marginBottom:'8px'}}/>
          <div style={{display:'flex',gap:'8px',justifyContent:'center'}}><button onClick={save} style={{background:'white',color:'black',border:'none',padding:'8px 16px',borderRadius:'20px',cursor:'pointer'}}>حفظ</button><button onClick={()=>setEdit(false)} style={{background:'#222',border:'none',color:'white',padding:'8px 16px',borderRadius:'20px',cursor:'pointer'}}>إلغاء</button></div>
        </>}
        <div style={{display:'flex',gap:'20px',justifyContent:'center',marginTop:'16px'}}>
          <div><strong>{myPosts.length}</strong><br/><small>منشور</small></div>
          <div><strong>0</strong><br/><small>متابع</small></div>
          <div><strong>0</strong><br/><small>يتابع</small></div>
        </div>
      </div>
      <div style={{background:'#111',borderRadius:'12px',padding:'12px'}}>
        <h3 style={{margin:'0 0 10px'}}>منشوراتي</h3>
        {!myPosts.length ? <p style={{color:'#888'}}>لم تنشر شيئاً بعد</p> : <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>{myPosts.map(p=><div key={p.id} style={{padding:'10px',background:'#0a0a0a',borderRadius:'8px',border:'1px solid #1a1a1a'}}>{p.content.slice(0,100)} - {timeAgo(p.created_at)}</div>)}</div>}
      </div>
      <button onClick={onSignOut} style={{background:'#1a1a1a',color:'#fff',border:'1px solid #333',padding:'12px',borderRadius:'12px',cursor:'pointer'}}>تسجيل خروج</button>
      <button onClick={deleteAccount} style={{background:'#1a1a1a',color:'#ef4444',border:'1px solid #331111',padding:'12px',borderRadius:'12px',cursor:'pointer'}}>حذف الحساب نهائياً</button>
      <div style={{background:'#0a0a0a',border:'1px dashed #333',borderRadius:'12px',padding:'12px',textAlign:'center',fontSize:'11px',color:'#666',marginTop:'12px'}}>
        تم بناء برمجة هذا البرنامج بواسطة ABD.ALLAH ZOHAIR OMARA<br/>WANAS v1.0 - مساحة الونس
      </div>
    </div>
  )
}

// MAIN APP
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
  const [msgCount,setMsgCount]=useState(0)
  const [editingPost,setEditingPost]=useState(null)
  const [editText,setEditText]=useState('')

  const notify = useCallback((text,type='info')=>{
    setNotice({text,type}); setTimeout(()=>setNotice(null),4000)
  },[])

  const loadProfile = useCallback(async()=>{
    const { data } = await supabase.from('profiles').select(PROFILE_FIELDS).eq('id',viewerId).maybeSingle()
    if(!data){
      const emailName = session.user.email?.split('@')[0]||'user'
      const { data: inserted } = await supabase.from('profiles').insert({ id: viewerId, username: emailName, display_name: emailName }).select().single()
      setProfile(inserted || {id:viewerId, username: emailName, display_name: emailName})
    } else {
      setProfile(data); setQuietMode(!!data.quiet_mode)
    }
  },[viewerId, session])

  const loadFeed = useCallback(async()=>{
    setLoading(true)
    let query = supabase.from('posts').select(POST_FIELDS).order('created_at',{ascending:false}).limit(50)
    if(quietMode){
      // في الوضع الهادئ - بس منشورات الأصدقاء
      const { data: fr } = await supabase.from('friends').select('user_a,user_b').or(`user_a.eq.${viewerId},user_b.eq.${viewerId}`)
      const friendIds = (fr||[]).map(f=> f.user_a===viewerId?f.user_b:f.user_a)
      if(friendIds.length) query = query.in('user_id', [...friendIds, viewerId])
      else query = query.eq('user_id', viewerId)
    }
    const { data, error } = await query
    if(error){ setPosts([]); setLoading(false); return }
    const ids = [...new Set((data||[]).map(r=>r.user_id))]
    const { data: profs } = ids.length ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id',ids) : {data:[]}
    const map = Object.fromEntries((profs||[]).map(p=>[p.id,p]))
    const { data: likes } = await supabase.from('likes').select('post_id').eq('user_id',viewerId)
    const likedSet = new Set((likes||[]).map(l=>l.post_id))
    const { data: saves } = await supabase.from('saves').select('post_id').eq('user_id',viewerId)
    const savedSet = new Set((saves||[]).map(s=>s.post_id))
    const { data: reposts } = await supabase.from('reposts').select('post_id').eq('user_id',viewerId)
    const repostedSet = new Set((reposts||[]).map(r=>r.post_id))
    const { data: blocks } = await supabase.from('blocks').select('blocked_id').eq('blocker_id',viewerId)
    const blockedSet = new Set((blocks||[]).map(b=>b.blocked_id))
    setPosts((data||[]).filter(r=>!blockedSet.has(r.user_id)).map(r=>({...r, profile: map[r.user_id], liked: likedSet.has(r.id), saved: savedSet.has(r.id), reposted: repostedSet.has(r.id)}))); setLoading(false)
  },[viewerId, quietMode])

  const loadCounts = useCallback(async()=>{
    const { count: n } = await supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',viewerId).eq('is_read',false)
    setNotifCount(n||0)
    const { count: m } = await supabase.from('messages').select('id',{count:'exact',head:true}).eq('to_user',viewerId).eq('is_read',false)
    setMsgCount(m||0)
  },[viewerId])

  useEffect(()=>{ loadProfile() },[loadProfile])
  useEffect(()=>{ loadFeed(); loadCounts(); const i=setInterval(loadCounts,10000); return ()=>clearInterval(i) },[loadFeed, loadCounts])

  const toggleLike = async (post)=>{
    const next = !post.liked
    setPosts(p=>p.map(x=> x.id===post.id ? {...x, liked:next, likes_count: Math.max(0,(x.likes_count||0)+(next?1:-1))} : x))
    try{
      if(next) await supabase.from('likes').insert({user_id:viewerId, post_id:post.id})
      else await supabase.from('likes').delete().eq('user_id',viewerId).eq('post_id',post.id)
    }catch(e){ setPosts(p=>p.map(x=> x.id===post.id ? {...x, liked:!next, likes_count: Math.max(0,(x.likes_count||0)+(!next?1:-1))} : x)); notify(shortError(e),'error') }
  }

  const toggleSave = async (post)=>{
    const next = !post.saved
    setPosts(p=>p.map(x=> x.id===post.id ? {...x, saved:next, saves_count: Math.max(0,(x.saves_count||0)+(next?1:-1))} : x))
    try{
      if(next) await supabase.from('saves').insert({user_id:viewerId, post_id:post.id})
      else await supabase.from('saves').delete().eq('user_id',viewerId).eq('post_id',post.id)
      notify(next?'تم الحفظ':'تم إلغاء الحفظ','success')
    }catch(e){ notify(shortError(e),'error') }
  }

  const toggleRepost = async (post)=>{
    const next = !post.reposted
    setPosts(p=>p.map(x=> x.id===post.id ? {...x, reposted:next, reposts_count: Math.max(0,(x.reposts_count||0)+(next?1:-1))} : x))
    try{
      if(next) await supabase.from('reposts').insert({user_id:viewerId, post_id:post.id})
      else await supabase.from('reposts').delete().eq('user_id',viewerId).eq('post_id',post.id)
      notify(next?'تمت إعادة النشر':'تم إلغاء إعادة النشر','success')
    }catch(e){ notify(shortError(e),'error') }
  }
  
  const deletePost = async (post)=>{
    if(!confirm('حذف المنشور؟')) return
    const { error } = await supabase.from('posts').delete().eq('id',post.id).eq('user_id',viewerId)
    if(error) return notify(shortError(error),'error')
    setPosts(p=>p.filter(x=>x.id!==post.id)); notify('تم الحذف','success')
  }

  const startEdit = (post)=>{ setEditingPost(post); setEditText(post.content) }
  const saveEdit = async ()=>{
    if(!editingPost) return
    const { error } = await supabase.from('posts').update({ content: editText }).eq('id', editingPost.id).eq('user_id', viewerId)
    if(error) return notify(shortError(error),'error')
    setPosts(p=>p.map(x=> x.id===editingPost.id ? {...x, content: editText} : x))
    setEditingPost(null); notify('تم التعديل','success')
  }

  const reportPost = async (post)=>{
    const reason = prompt('سبب الإبلاغ؟'); if(!reason) return
    await supabase.from('reports').insert({ reporter_id: viewerId, reported_post_id: post.id, reported_user_id: post.user_id, reason, type:'post' })
    notify('تم إرسال البلاغ، شكراً','success')
  }

  const blockUser = async (post)=>{
    if(!confirm(`حظر @${post.profile?.username}؟ لن ترى منشوراته بعد الآن`)) return
    await supabase.from('blocks').insert({ blocker_id: viewerId, blocked_id: post.user_id })
    setPosts(p=>p.filter(x=>x.user_id!==post.user_id)); notify('تم الحظر','success')
  }

  const sharePost = async (post)=>{
    const url = `${window.location.origin}/post/${post.id}`
    if(navigator.share){ try{ await navigator.share({title:'WANAS', text: post.content, url}); } catch{} }
    else if(navigator.clipboard){ await navigator.clipboard.writeText(url); notify('تم نسخ رابط المنشور','success') }
  }

  const toggleQuiet = async ()=>{
    const next = !quietMode
    setQuietMode(next)
    if(profile) await supabase.from('profiles').update({ quiet_mode: next }).eq('id', viewerId)
    notify(next?'تم تفعيل الوضع الهادئ - بس منشورات الأصدقاء':'تم إيقاف الوضع الهادئ','info')
  }

  return (
    <div className="app-shell" dir="rtl" style={{background:'#000',color:'#fff',minHeight:'100vh',fontFamily:'Cairo, sans-serif',paddingBottom:'80px'}}>
      <AppHeader profile={profile} quietMode={quietMode} onToggleQuiet={toggleQuiet} setTab={setTab} notifCount={notifCount} msgCount={msgCount}/>
      <main className="main-content" style={{maxWidth:'600px',margin:'0 auto',padding:'12px'}}>
        {notice && <div style={{background: notice.type==='error' ? '#7f1d1d' : '#065f46', color:'white', padding:'10px 14px', borderRadius:'10px', marginBottom:'12px', display:'flex', justifyContent:'space-between',position:'sticky',top:'60px',zIndex:10}}><span>{notice.text}</span><button onClick={()=>setNotice(null)} style={{background:'none',border:'none',color:'white',cursor:'pointer'}}>×</button></div>}
        
        {tab==='home' && <>
          {profile && <StoriesRail viewerId={viewerId} onNotify={notify}/>}
          {profile && <Composer profile={profile} onCreated={loadFeed} notify={notify}/>}
          <section className="feed-list" style={{display:'flex',flexDirection:'column',gap:'12px',marginTop:'12px'}}>
            {loading ? <div style={{background:'#111',borderRadius:'12px',padding:'20px',textAlign:'center'}}>جارٍ التحميل…</div> : !posts.length ? <div style={{background:'#111',borderRadius:'12px',padding:'20px',textAlign:'center',color:'#888'}}>لا توجد منشورات بعد. كن أول من يشارك!<br/><br/><small>💡 فعل الوضع الهادئ بيعرض بس منشورات أصدقائك</small></div> : posts.map(p=> <PostItem key={p.id} post={p} viewerId={viewerId} onLike={toggleLike} onSave={toggleSave} onRepost={toggleRepost} onDelete={deletePost} onEdit={startEdit} onOpenComments={setActivePost} onShare={sharePost} onReport={reportPost} onBlock={blockUser}/>)}
          </section>
        </>}

        {tab==='search' && <SearchTab notify={notify}/>}
        {tab==='friends' && <FriendsTab viewerId={viewerId} notify={notify}/>}
        {tab==='messages' && <MessagesTab viewerId={viewerId} notify={notify}/>}
        {tab==='notifications' && <NotificationsTab viewerId={viewerId}/>}
        {tab==='profile' && profile && <ProfileTab profile={profile} myPosts={posts.filter(p=>p.user_id===viewerId)} onUpdate={loadProfile} onSignOut={onSignOut} notify={notify}/>}
        {tab==='video' && <div style={{background:'#111',borderRadius:'12px',padding:'40px 20px',textAlign:'center',color:'#888'}}><div style={{fontSize:'48px',marginBottom:'12px'}}>▶️</div><h3>فيديو</h3><p>مقاطع الفيديو القصيرة - قريباً</p><p style={{fontSize:'12px',marginTop:'20px'}}>هنا هتقدر ترفع فيديو كمنشور وده موجود في قاعدة البيانات كـ media_type video</p></div>}
        {tab==='councils' && <div style={{background:'#111',borderRadius:'12px',padding:'40px 20px',textAlign:'center',color:'#888'}}><div style={{fontSize:'48px',marginBottom:'12px'}}>🎧</div><h3>المجالس</h3><p>غرف صوتية جماعية - قريباً</p><p style={{fontSize:'12px',marginTop:'20px'}}>هتكون زي Clubhouse - غرف صوتية مباشرة</p></div>}
        {tab==='settings' && <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
          <div style={{background:'#111',borderRadius:'12px',padding:'16px'}}><h3>الإعدادات</h3>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid #1a1a1a'}}><span>الوضع الهادئ 🌿</span><button onClick={toggleQuiet} style={{background: quietMode?'#10b981':'#333',border:'none',color:'white',padding:'6px 14px',borderRadius:'20px',cursor:'pointer'}}>{quietMode?'مفعل':'متوقف'}</button></div>
            <div style={{padding:'12px 0',borderBottom:'1px solid #1a1a1a'}}><span>اللغة: العربية</span></div>
            <div style={{padding:'12px 0'}}><a href="/privacy.html" style={{color:'#888'}}>سياسة الخصوصية</a> · <a href="/terms.html" style={{color:'#888'}}>شروط الاستخدام</a></div>
          </div>
          <div style={{background:'#111',borderRadius:'12px',padding:'16px',textAlign:'center',fontSize:'12px',color:'#666'}}>
            تم بناء برمجة هذا البرنامج بواسطة ABD.ALLAH ZOHAIR OMARA<br/>WANAS v1.0<br/>app.wanas.social
          </div>
        </div>}
      </main>

      <nav className="bottom-nav" style={{position:'fixed',bottom:0,left:0,right:0,background:'#0a0a0a',borderTop:'1px solid #1a1a1a',display:'flex',justifyContent:'space-around',padding:'8px 0 calc(8px + env(safe-area-inset-bottom))',zIndex:20}}>
        {[
          ['home','الرئيسية','⌂'],
          ['video','فيديو','▶'],
          ['councils','المجالس','🎧'],
          ['messages','الرسائل','✉'],
          ['settings','الإعدادات','⚙'],
        ].map(([id,label,icon])=>(
          <button key={id} onClick={()=>setTab(id)} style={{background:'none',border:'none',color: tab===id ? 'white' : '#666',display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',cursor:'pointer',padding:'6px 18px',borderRadius:'12px',backgroundColor: tab===id ? '#1a1a1a' : 'transparent'}}><span style={{fontSize:'20px'}}>{icon}</span><small style={{fontSize:'10px'}}>{label}</small></button>
        ))}
      </nav>

      {activePost && <CommentsSheet post={activePost} viewerProfile={profile} onClose={()=>{setActivePost(null); loadFeed()}} notify={notify} onCommentAdded={()=>{setPosts(p=>p.map(x=> x.id===activePost.id ? {...x, comments_count: (x.comments_count||0)+1} : x))}}/>}
      
      {editingPost && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:101,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div style={{background:'#111',borderRadius:'16px',padding:'20px',width:'100%',maxWidth:'500px'}}>
            <h3>تعديل المنشور</h3>
            <textarea value={editText} onChange={e=>setEditText(e.target.value)} rows={4} style={{width:'100%',background:'#0a0a0a',border:'1px solid #333',borderRadius:'10px',padding:'10px',color:'white',marginTop:'12px'}}/>
            <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'12px'}}><button onClick={()=>setEditingPost(null)} style={{background:'#222',border:'none',color:'white',padding:'8px 16px',borderRadius:'20px',cursor:'pointer'}}>إلغاء</button><button onClick={saveEdit} style={{background:'white',color:'black',border:'none',padding:'8px 16px',borderRadius:'20px',cursor:'pointer'}}>حفظ</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
