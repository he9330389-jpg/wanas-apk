import React, { useEffect, useState } from 'react'
import App from './App.jsx'
import AuthScreen, { PasswordRecoveryScreen } from './components/AuthScreen.jsx'
import { isSupabaseConfigured, supabase } from './utils/supabase.js'

function SetupNotice() {
  return <main className="center-page" dir="rtl"><section className="panel setup-panel">
    <div className="brand-mark">و</div><h1>يلزم ربط Supabase</h1>
    <p>أضف <code>VITE_SUPABASE_URL</code> و<code>VITE_SUPABASE_ANON_KEY</code> في إعدادات Vercel وGitHub Actions، ثم أعد النشر.</p>
    <p className="muted">لا تضع مفتاح service_role في التطبيق أو في مستودع GitHub.</p>
  </section></main>
}

export default function Root() {
  const [session, setSession] = useState(undefined)
  const [authError, setAuthError] = useState('')
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  useEffect(() => {
    if (!supabase) return undefined
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) setAuthError(error.message)
      setSession(data?.session ?? null)
    }).catch((error) => {
      if (alive) { setAuthError(error.message || 'تعذر الاتصال بخدمة تسجيل الدخول'); setSession(null) }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => { if (alive) { if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true); setSession(nextSession) } })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  if (!isSupabaseConfigured) return <SetupNotice />
  if (session === undefined) return <main className="center-page" dir="rtl"><p className="muted">جاري التحميل…</p></main>
  if (!session) return <AuthScreen initialError={authError} />
  if (passwordRecovery) return <PasswordRecoveryScreen onComplete={() => setPasswordRecovery(false)} />

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) window.alert(`تعذر تسجيل الخروج: ${error.message}`)
  }
  const deleteAccount = async () => {
    if (!window.confirm('سيُحذف الحساب والمنشورات التابعة له نهائيًا. هل تريد المتابعة؟')) return
    // Remove this user's stored images first; a failed cleanup stops deletion to avoid orphaned files.
    let offset = 0
    while (true) {
      const { data: files, error: listError } = await supabase.storage.from('posts').list(session.user.id, { limit: 1000, offset })
      if (listError) { window.alert(`تعذر فحص الصور قبل الحذف: ${listError.message}`); return }
      const paths = (files || []).filter((file) => file.id).map((file) => `${session.user.id}/${file.name}`)
      if (paths.length) {
        const { error } = await supabase.storage.from('posts').remove(paths)
        if (error) { window.alert(`تعذر حذف الصور: ${error.message}`); return }
      }
      if (!files || files.length < 1000) break
      offset += files.length
    }
    const { error } = await supabase.rpc('delete_my_account')
    if (error) { window.alert(`تعذر حذف الحساب: ${error.message}`); return }
    await supabase.auth.signOut()
  }
  return <App session={session} onSignOut={signOut} onDeleteAccount={deleteAccount} />
}
