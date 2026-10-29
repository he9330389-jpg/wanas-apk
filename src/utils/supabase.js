import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(url && key)
export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'wanas-auth-v1' },
      global: { headers: { 'X-Client-Info': 'wanas-web@1.0.0' } },
    })
  : null

export function getProfileLink(username) {
  return `${window.location.origin}/@${encodeURIComponent(username)}`
}
