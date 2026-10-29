import React, { useState } from 'react'
import { supabase } from '../utils/supabase.js'

const friendlyError = (message = '') => {
  if (/invalid login credentials/i.test(message)) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
  if (/user already registered/i.test(message)) return 'هذا البريد مسجّل بالفعل. جرّب تسجيل الدخول.'
  if (/email not confirmed/i.test(message)) return 'فعّل بريدك الإلكتروني من الرسالة التي وصلتك.'
  if (/rate limit/i.test(message)) return 'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.'
  return message || 'حدث خطأ غير متوقع. حاول مرة أخرى.'
}

export default function AuthScreen({ initialError = '' }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(initialError ? { type: 'error', text: friendlyError(initialError) } : null)

  const submit = async (event) => {
    event.preventDefault()
    setMessage(null)
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return setMessage({ type: 'error', text: 'اكتب بريدًا إلكترونيًا صحيحًا.' })
    if (mode !== 'reset' && password.length < 8) return setMessage({ type: 'error', text: 'كلمة المرور يجب ألا تقل عن 8 أحرف.' })
    if (mode === 'signup' && !/^[a-z0-9._]{3,30}$/.test(username)) return setMessage({ type: 'error', text: 'اسم المستخدم من 3 إلى 30 حرفًا إنجليزيًا صغيرًا أو رقمًا أو نقطة أو شرطة سفلية.' })
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password, options: { data: { username, display_name: displayName.trim() || username } } })
        if (error) throw error
        setMessage({ type: 'success', text: data.session ? 'تم إنشاء الحساب وتسجيل الدخول.' : 'تم إنشاء الحساب. افتح رسالة التفعيل في بريدك ثم سجّل الدخول.' })
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: import.meta.env.VITE_APP_URL || 'https://wanas-apk-global.vercel.app' })
        if (error) throw error
        setMessage({ type: 'success', text: 'إذا كان البريد مسجلًا، ستصلك رسالة لإعادة تعيين كلمة المرور.' })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        if (error) throw error
      }
    } catch (error) {
      setMessage({ type: 'error', text: friendlyError(error.message) })
    } finally { setBusy(false) }
  }
  const changeMode = (nextMode) => { setMode(nextMode); setMessage(null); setPassword('') }

  return <main className="center-page" dir="rtl"><section className="panel auth-panel">
    <div className="brand-lockup"><div className="brand-mark">و</div><span>وَنَس</span></div>
    <h1>{mode === 'login' ? 'أهلًا بعودتك' : mode === 'signup' ? 'أنشئ حسابك' : 'استعادة كلمة المرور'}</h1>
    <p className="muted">مساحة اجتماعية عربية تجمعك بالناس القريبين منك.</p>
    <form onSubmit={submit} className="form-stack">
      {mode === 'signup' && <>
        <label>اسم العرض<input autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="الاسم الذي سيظهر للناس" maxLength={60} /></label>
        <label>اسم المستخدم<input dir="ltr" autoCapitalize="none" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="مثال: ahmed.art" maxLength={30} /></label>
      </>}
      <label>البريد الإلكتروني<input dir="ltr" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required /></label>
      {mode !== 'reset' && <label>كلمة المرور<input dir="ltr" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label>}
      {message && <div role="status" className={`notice ${message.type}`}>{message.text}</div>}
      <button className="button primary" disabled={busy}>{busy ? 'جارٍ التنفيذ…' : mode === 'login' ? 'تسجيل الدخول' : mode === 'signup' ? 'إنشاء الحساب' : 'إرسال رابط الاستعادة'}</button>
    </form>
    <div className="auth-links">
      {mode === 'login' && <button className="link-button" onClick={() => changeMode('reset')}>نسيت كلمة المرور؟</button>}
      {mode === 'reset' && <button className="link-button" onClick={() => changeMode('login')}>العودة لتسجيل الدخول</button>}
      {mode !== 'reset' && <button className="link-button" onClick={() => changeMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'ليس لديك حساب؟ إنشاء حساب' : 'لديك حساب؟ تسجيل الدخول'}</button>}
    </div>
    <p className="legal-note">بإنشاء الحساب، أنت توافق على <a href="/terms.html">شروط الاستخدام</a> و<a href="/privacy.html">سياسة الخصوصية</a>.</p>
  </section></main>
}


export function PasswordRecoveryScreen({ onComplete }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const save = async (event) => {
    event.preventDefault()
    setMessage('')
    if (password.length < 8) return setMessage('كلمة المرور يجب ألا تقل عن 8 أحرف.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setMessage(friendlyError(error.message))
    else { setMessage('تم تحديث كلمة المرور.'); window.setTimeout(onComplete, 800) }
  }
  return <main className="center-page" dir="rtl"><section className="panel auth-panel">
    <div className="brand-lockup"><div className="brand-mark">و</div><span>وَنَس</span></div>
    <h1>أنشئ كلمة مرور جديدة</h1><p className="muted">اكتب كلمة مرور جديدة لحسابك.</p>
    <form onSubmit={save} className="form-stack"><label>كلمة المرور الجديدة<input dir="ltr" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label>
      {message && <div role="status" className={`notice ${message.startsWith('تم') ? 'success' : 'error'}`}>{message}</div>}
      <button className="button primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'تحديث كلمة المرور'}</button>
    </form>
  </section></main>
}
