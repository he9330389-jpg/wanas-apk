import React, { useCallback, useEffect, useState } from 'react'
import { supabase } from '../utils/supabase.js'

const FIELDS = 'id,username,display_name,avatar_url,is_verified,created_at'
const labelFor = (type) => ({ like: 'أعجب بمنشورك', comment: 'علّق على منشورك', repost: 'أعاد نشر منشورك', share: 'شارك منشورك', friend_request: 'أرسل لك طلب صداقة', birthday: 'عيد ميلاد سعيد', mention: 'أشار إليك' }[type] || 'لديك تنبيه جديد')

export default function NotificationsPanel({ viewer, notify }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('notifications').select('id,type,from_user,post_id,is_read,created_at').eq('user_id', viewer.id).order('created_at', { ascending: false }).limit(100)
    if (error) notify(error.message || 'تعذر تحميل التنبيهات.', 'error')
    const ids = [...new Set((data || []).map((n) => n.from_user).filter(Boolean))]
    const people = ids.length ? await supabase.from('profiles').select(FIELDS).in('id', ids) : { data: [] }
    const map = Object.fromEntries((people.data || []).map((p) => [p.id, p]))
    setItems((data || []).map((n) => ({ ...n, profile: map[n.from_user] })))
    setLoading(false)
  }, [viewer.id, notify])
  useEffect(() => { load() }, [load])
  const markRead = async (item) => {
    if (item.is_read) return
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', item.id).eq('user_id', viewer.id)
    if (error) notify(error.message || 'تعذر تحديث التنبيه.', 'error')
    else setItems((prev) => prev.map((n) => n.id === item.id ? { ...n, is_read: true } : n))
  }
  const unread = items.filter((n) => !n.is_read).length
  return <section className="panel section-panel"><div className="notification-heading"><h2>التنبيهات</h2><div><span className="count-pill">{unread} غير مقروء</span><button className="subtle-button" onClick={load}>تحديث</button></div></div>
    {loading ? <p className="empty-state">جارٍ تحميل التنبيهات…</p> : !items.length ? <p className="empty-state">لا توجد تنبيهات حتى الآن.</p> : items.map((item) => <button key={item.id} className={item.is_read ? 'notification-row' : 'notification-row unread'} onClick={() => markRead(item)}>
      <span className="avatar avatar-sm avatar-fallback">{(item.profile?.display_name || item.profile?.username || 'و')[0]}</span>
      <span className="notification-body"><span><strong>{item.profile?.display_name || item.profile?.username || 'مستخدم'}</strong> {labelFor(item.type)}</span><time>{new Date(item.created_at).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' })}</time></span>
    </button>)}
  </section>
}
