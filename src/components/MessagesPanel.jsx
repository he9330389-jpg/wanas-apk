import React, { useCallback, useEffect, useState } from 'react'
import { supabase } from '../utils/supabase.js'

const FIELDS = 'id,username,display_name,bio,avatar_url,is_verified,created_at'
const messageError = (e) => e?.message || 'تعذر تنفيذ العملية.'

export default function MessagesPanel({ viewer, notify }) {
  const [threads, setThreads] = useState([])
  const [person, setPerson] = useState(null)
  const [messages, setMessages] = useState([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadThreads = useCallback(async () => {
    const { data, error } = await supabase.from('messages').select('id,from_user,to_user,content,created_at,is_read').or(`from_user.eq.${viewer.id},to_user.eq.${viewer.id}`).order('created_at', { ascending: false }).limit(200)
    if (error) { notify(messageError(error), 'error'); return }
    const latest = new Map()
    for (const row of data || []) {
      const other = row.from_user === viewer.id ? row.to_user : row.from_user
      if (!latest.has(other)) latest.set(other, row)
    }
    const ids = [...latest.keys()]
    const profiles = ids.length ? await supabase.from('profiles').select(FIELDS).in('id', ids) : { data: [] }
    const map = Object.fromEntries((profiles.data || []).map((p) => [p.id, p]))
    setThreads([...latest.entries()].map(([id, last]) => ({ profile: map[id], last })).filter((t) => t.profile))
  }, [viewer.id, notify])

  const loadConversation = useCallback(async (target) => {
    setLoading(true)
    const filter = `and(from_user.eq.${viewer.id},to_user.eq.${target.id}),and(from_user.eq.${target.id},to_user.eq.${viewer.id})`
    const { data, error } = await supabase.from('messages').select('id,from_user,to_user,content,created_at,is_read').or(filter).order('created_at', { ascending: true }).limit(300)
    if (error) notify(messageError(error), 'error')
    else setMessages(data || [])
    const { error: readError } = await supabase.from('messages').update({ is_read: true }).eq('from_user', target.id).eq('to_user', viewer.id).eq('is_read', false)
    if (readError) notify(messageError(readError), 'error')
    setLoading(false)
    loadThreads()
  }, [viewer.id, notify, loadThreads])

  useEffect(() => { loadThreads() }, [loadThreads])
  useEffect(() => {
    if (!person) return undefined
    const timer = window.setInterval(() => loadConversation(person), 15000)
    return () => window.clearInterval(timer)
  }, [person, loadConversation])

  const searchPeople = async (event) => {
    event?.preventDefault()
    const term = query.trim().replace(/^@/, '')
    if (term.length < 2) { setResults([]); return }
    const { data, error } = await supabase.from('profiles').select(FIELDS).ilike('username', `%${term}%`).neq('id', viewer.id).limit(10)
    if (error) notify(messageError(error), 'error')
    setResults(data || [])
  }

  const openPerson = async (target) => { setPerson(target); setResults([]); await loadConversation(target) }
  const send = async (event) => {
    event.preventDefault()
    if (!person || !text.trim()) return
    setBusy(true)
    const { error } = await supabase.from('messages').insert({ from_user: viewer.id, to_user: person.id, content: text.trim() })
    setBusy(false)
    if (error) notify(messageError(error), 'error')
    else { setText(''); await loadConversation(person) }
  }
  const formatTime = (value) => new Date(value).toLocaleString('ar', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })

  return <section className="panel section-panel messages-panel">
    <div className="messages-layout">
      <aside className="thread-sidebar">
        <h2>الرسائل</h2>
        <form className="search-form message-search" onSubmit={searchPeople}><input dir="ltr" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابدأ محادثة باسم المستخدم" /><button className="button primary compact">بحث</button></form>
        {results.map((p) => <button className="thread-row" key={p.id} onClick={() => openPerson(p)}><span className="avatar avatar-sm avatar-fallback">{(p.display_name || p.username || 'و')[0]}</span><span className="person-info"><strong>{p.display_name || p.username}</strong><span dir="ltr">@{p.username}</span></span></button>)}
        <div className="thread-list">{threads.map((t) => <button className={person?.id === t.profile.id ? 'thread-row active' : 'thread-row'} key={t.profile.id} onClick={() => openPerson(t.profile)}><span className="avatar avatar-sm avatar-fallback">{(t.profile.display_name || t.profile.username || 'و')[0]}</span><span className="person-info"><strong>{t.profile.display_name || t.profile.username}</strong><span>{t.last.content || 'مرفق'}</span></span></button>)}</div>
      </aside>
      <div className="conversation">
        {!person ? <div className="empty-state">اختر محادثة أو ابحث عن مستخدم لبدء محادثة.</div> : <>
          <div className="conversation-title"><button className="link-button back-conversation" onClick={() => setPerson(null)}>رجوع</button><strong>{person.display_name || person.username}</strong><span dir="ltr">@{person.username}</span></div>
          <div className="message-list">{loading ? <p className="muted">جارٍ تحميل الرسائل…</p> : messages.length ? messages.map((m) => <div key={m.id} className={m.from_user === viewer.id ? 'message-bubble mine' : 'message-bubble'}><p>{m.content}</p><time>{formatTime(m.created_at)}</time></div>) : <p className="empty-state">لا توجد رسائل بعد. ابدأ الحديث.</p>}</div>
          <form className="comment-form message-form" onSubmit={send}><input value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="اكتب رسالة…" /><button className="button primary compact" disabled={busy || !text.trim()}>{busy ? '…' : 'إرسال'}</button></form>
        </>}
      </div>
    </div>
  </section>
}
