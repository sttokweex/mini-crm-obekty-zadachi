import { useState, type FormEvent } from 'react'
import { supabase } from './lib'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError('Проверьте email и пароль.')
    } catch {
      setError('Не удалось подключиться. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="center">
      <form className="panel login" onSubmit={(event) => void submit(event)}>
        <h1>Вход в CRM</h1>
        <p className="muted">Доступ выдает администратор</p>
        <label>
          Email
          <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Пароль
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <div role="alert" className="alert">{error}</div>}
        <button disabled={busy}>Войти</button>
      </form>
    </main>
  )
}
