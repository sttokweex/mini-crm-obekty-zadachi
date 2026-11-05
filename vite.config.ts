import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const key = env.VITE_SUPABASE_ANON_KEY
  let keyRole = ''
  if (key?.split('.').length === 3) {
    try {
      keyRole = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role
    } catch { /* invalid JWT is reported by Supabase at runtime */ }
  }
  if (key?.startsWith('sb_secret_') || keyRole === 'service_role' || keyRole === 'supabase_admin') {
    throw new Error('A Supabase secret key cannot be used in the frontend. Use the publishable/anon key.')
  }
  if (command === 'build') {
    const url = env.VITE_SUPABASE_URL
    let validUrl = false
    try { validUrl = new URL(url).protocol === 'https:' } catch { /* missing or invalid URL */ }
    if (!validUrl || url.includes('your-project') || !key || key.includes('your-publishable') || key.length < 20) {
      throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before building. See DEPLOY_VERCEL.md.')
    }
  }
  return { plugins: [react()] }
})
