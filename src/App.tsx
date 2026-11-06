import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configured, errorMessage, nextStatus, statusLabel, supabase, type History, type Profile, type Project, type Status, type Task } from './lib'

type Data = { profile: Profile | null; profiles: Profile[]; projects: Project[]; tasks: Task[] }
const emptyData: Data = { profile: null, profiles: [], projects: [], tasks: [] }
const date = (value: string) => new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
const navigate = (path: string) => { window.location.hash = path }

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [route, setRoute] = useState(window.location.hash.slice(1) || 'objects')
  const [data, setData] = useState<Data>(emptyData)
  const [history, setHistory] = useState<History[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<'project' | 'task' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    const change = () => setRoute(window.location.hash.slice(1) || 'objects')
    window.addEventListener('hashchange', change)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next); setAuthReady(true)
      if (!next) setData(emptyData)
    })
    supabase.auth.getSession().then(({ data: result }) => {
      setSession(result.session); setAuthReady(true)
    })
    return () => { window.removeEventListener('hashchange', change); listener.subscription.unsubscribe() }
  }, [])

  const refresh = useCallback(async () => {
    if (!session) return
    setLoading(true); setError('')
    try {
      const [me, people, objects, work] = await Promise.all([
        supabase.from('profiles').select('id,display_name,role').eq('id', session.user.id).single(),
        supabase.from('profiles').select('id,display_name,role').order('display_name'),
        supabase.from('projects').select('id,name,address,created_at').order('created_at', { ascending: false }),
        supabase.from('tasks').select('id,project_id,title,description,assignee_id,author_id,status,created_at').order('created_at', { ascending: false })
      ])
      for (const result of [me, people, objects, work]) if (result.error) throw result.error
      setData({ profile: me.data as Profile, profiles: people.data as Profile[], projects: objects.data as Project[], tasks: work.data as Task[] })
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [session])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const taskId = route.startsWith('task/') ? route.slice(5) : null
    if (!session || !taskId) { setHistory([]); return }
    supabase.from('task_history').select('id,task_id,actor_id,from_status,to_status,comment,created_at')
      .eq('task_id', taskId).order('created_at').order('id')
      .then(({ data: events, error: cause }) => {
        if (cause) setError(cause.message)
        else setHistory(events as History[])
      })
  }, [route, session, data.tasks])

  async function action(work: () => Promise<void>) {
    setBusy(true); setError('')
    try { await work(); await refresh() }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function transition(task: Task, to: Status) {
    let comment: string | null = null
    if (to === 'rework') {
      comment = window.prompt('Причина возврата на доработку:')
      if (comment === null) return
      if (!comment.trim()) { setError('Укажите комментарий для доработки.'); return }
    }
    await action(async () => {
      const { error: cause } = await supabase.rpc('transition_task', { p_task_id: task.id, p_to_status: to, p_comment: comment })
      if (cause) throw cause
    })
  }

  async function remove(kind: 'project' | 'task', id: string) {
    if (!window.confirm(kind === 'project' ? 'Удалить объект и скрыть все его задачи?' : 'Удалить задачу?')) return
    await action(async () => {
      const { error: cause } = await supabase.rpc(kind === 'project' ? 'delete_project' : 'delete_task',
        kind === 'project' ? { p_project_id: id } : { p_task_id: id })
      if (cause) throw cause
      navigate('objects')
    })
  }

  const manager = data.profile?.role === 'manager'
  const person = (id: string) => data.profiles.find(p => p.id === id)?.display_name || 'Пользователь'
  const project = (id: string) => data.projects.find(p => p.id === id)
  const task = route.startsWith('task/') ? data.tasks.find(t => t.id === route.slice(5)) : undefined
  const currentProject = route.startsWith('object/') ? project(route.slice(7)) : undefined

  if (!configured) return <main className="center"><section className="panel"><h1>Нужна настройка Supabase</h1><p>Добавьте URL проекта и publishable key в <code>.env.local</code> по образцу <code>.env.example</code>, затем перезапустите приложение.</p></section></main>
  if (!authReady) return <main className="center">Загрузка…</main>
  if (!session) return <Login />

  return <div className="shell">
    <header className="topbar"><div className="brand">Объекты и задачи</div><div className="user">{data.profile?.display_name || session.user.email} <span className="role">{manager ? 'Постановщик' : 'Исполнитель'}</span><button className="text-button" onClick={() => void supabase.auth.signOut()}>Выйти</button></div></header>
    <div className="layout"><nav className="sidebar"><a className={route === 'objects' ? 'active' : ''} href="#objects">Объекты</a>{!manager && <a className={route === 'my' ? 'active' : ''} href="#my">Мои задачи</a>}</nav>
      <main className="content">
        {error && <div role="alert" className="alert">{error}<button aria-label="Закрыть" onClick={() => setError('')}>×</button></div>}
        {loading && <div className="muted">Обновление…</div>}
        {route === 'objects' && <><div className="heading"><div><h1>Объекты</h1><p>Стройки и задачи по ним</p></div>{manager && <button onClick={() => { setEditing('project'); setEditingId(null) }}>Добавить объект</button>}</div>
          {data.projects.length === 0 ? <Empty text="Объектов пока нет" /> : <div className="cards">{data.projects.map(p => <a className="card" href={'#object/' + p.id} key={p.id}><h2>{p.name}</h2><p>{p.address}</p><span className="muted">Задач: {data.tasks.filter(t => t.project_id === p.id).length}</span></a>)}</div>}</>}
        {route === 'my' && !manager && <><div className="heading"><div><h1>Мои задачи</h1><p>Задачи, назначенные вам</p></div></div><TaskList tasks={data.tasks} project={project} /></>}
        {route.startsWith('object/') && (currentProject ? <><a className="back" href="#objects">← Объекты</a><div className="heading"><div><h1>{currentProject.name}</h1><p>{currentProject.address}</p></div>{manager && <div className="actions"><button className="secondary" onClick={() => { setEditing('project'); setEditingId(currentProject.id) }}>Изменить</button><button className="danger" disabled={busy} onClick={() => void remove('project', currentProject.id)}>Удалить</button></div>}</div>
          <div className="heading subheading"><h2>Задачи</h2>{manager && <button onClick={() => { setEditing('task'); setEditingId(null) }}>Добавить задачу</button>}</div><TaskList tasks={data.tasks.filter(t => t.project_id === currentProject.id)} project={project} person={person} /></> : <Empty text="Объект не найден или недоступен" />)}
        {route.startsWith('task/') && (task ? <><a className="back" href={'#object/' + task.project_id}>← {project(task.project_id)?.name || 'Объект'}</a><div className="heading"><div><h1>{task.title}</h1><span className={'badge ' + task.status}>{statusLabel[task.status]}</span></div>{manager && <div className="actions"><button className="secondary" onClick={() => { setEditing('task'); setEditingId(task.id) }}>Изменить</button><button className="danger" disabled={busy} onClick={() => void remove('task', task.id)}>Удалить</button></div>}</div>
          <section className="panel details"><p className="description">{task.description || 'Описание не указано'}</p><dl><div><dt>Объект</dt><dd>{project(task.project_id)?.name}</dd></div><div><dt>Исполнитель</dt><dd>{person(task.assignee_id)}</dd></div><div><dt>Автор</dt><dd>{person(task.author_id)}</dd></div><div><dt>Создана</dt><dd>{date(task.created_at)}</dd></div></dl></section>
          <div className="actions transition-actions">{nextStatus[task.status]?.filter(() => manager ? task.status === 'review' : task.assignee_id === session.user.id && task.status !== 'review').map(to => <button key={to} disabled={busy} onClick={() => void transition(task, to)}>{to === 'rework' ? 'Вернуть на доработку' : to === 'accepted' ? 'Принять' : to === 'review' ? 'Отправить на проверку' : 'Взять в работу'}</button>)}</div>
          <h2>История статусов</h2><section className="panel history">{history.length === 0 ? <p className="muted">Записей пока нет</p> : history.map(event => <div className="event" key={event.id}><div className="event-line"><strong>{event.from_status ? statusLabel[event.from_status] + ' → ' : 'Создана → '}{statusLabel[event.to_status]}</strong><time>{date(event.created_at)}</time></div><div className="muted">{person(event.actor_id)}</div>{event.comment && <p>{event.comment}</p>}</div>)}</section></> : <Empty text="Задача не найдена или недоступна" />)}
      </main></div>
    {editing && <Editor kind={editing} item={editingId ? (editing === 'project' ? data.projects.find(p => p.id === editingId) : data.tasks.find(t => t.id === editingId)) : undefined}
      projects={data.projects} profiles={data.profiles} defaultProjectId={currentProject?.id} userId={session.user.id}
      onClose={() => { setEditing(null); setEditingId(null) }} onSaved={async (id, kind) => { setEditing(null); setEditingId(null); await refresh(); navigate(kind === 'project' ? 'object/' + id : 'task/' + id) }} />}
  </div>
}

function Empty({ text }: { text: string }) { return <div className="panel empty">{text}</div> }

function TaskList({ tasks, project, person }: { tasks: Task[]; project: (id: string) => Project | undefined; person?: (id: string) => string }) {
  if (!tasks.length) return <Empty text="Задач пока нет" />
  return <div className="task-list">{tasks.map(task => <a href={'#task/' + task.id} className="task-row" key={task.id}><div><strong>{task.title}</strong><div className="muted">{project(task.project_id)?.name}{person && ' · ' + person(task.assignee_id)}</div></div><span className={'badge ' + task.status}>{statusLabel[task.status]}</span></a>)}</div>
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    const { error: cause } = await supabase.auth.signInWithPassword({ email, password })
    if (cause) setError('Проверьте email и пароль.')
    setBusy(false)
  }
  return <main className="center"><form className="panel login" onSubmit={e => void submit(e)}><h1>Вход в CRM</h1><p className="muted">Доступ выдает администратор</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label><label>Пароль<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <div role="alert" className="alert">{error}</div>}<button disabled={busy}>Войти</button></form></main>
}

function Editor({ kind, item, projects, profiles, defaultProjectId, userId, onClose, onSaved }: {
  kind: 'project' | 'task'; item?: Project | Task; projects: Project[]; profiles: Profile[]; defaultProjectId?: string; userId: string;
  onClose: () => void; onSaved: (id: string, kind: 'project' | 'task') => Promise<void>
}) {
  const existingProject = kind === 'project' ? item as Project | undefined : undefined
  const existingTask = kind === 'task' ? item as Task | undefined : undefined
  const [name, setName] = useState(existingProject?.name || existingTask?.title || '')
  const [address, setAddress] = useState(existingProject?.address || '')
  const [description, setDescription] = useState(existingTask?.description || '')
  const [projectId, setProjectId] = useState(existingTask?.project_id || defaultProjectId || projects[0]?.id || '')
  const [assigneeId, setAssigneeId] = useState(existingTask?.assignee_id || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (kind === 'project') {
        const query = existingProject ? supabase.from('projects').update({ name: name.trim(), address: address.trim() }).eq('id', existingProject.id).select('id').single()
          : supabase.from('projects').insert({ name: name.trim(), address: address.trim() }).select('id').single()
        const { data: saved, error: cause } = await query
        if (cause) throw cause
        await onSaved(saved.id, kind)
      } else {
        if (!projectId || !assigneeId) throw new Error('Выберите объект и исполнителя.')
        const fields = { project_id: projectId, title: name.trim(), description: description.trim(), assignee_id: assigneeId }
        const query = existingTask ? supabase.from('tasks').update(fields).eq('id', existingTask.id).select('id').single()
          : supabase.from('tasks').insert({ ...fields, author_id: userId }).select('id').single()
        const { data: saved, error: cause } = await query
        if (cause) throw cause
        await onSaved(saved.id, kind)
      }
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><form className="panel editor" onSubmit={e => void submit(e)}><div className="heading"><h2>{item ? 'Изменить' : 'Создать'} {kind === 'project' ? 'объект' : 'задачу'}</h2><button type="button" className="icon" aria-label="Закрыть" onClick={onClose}>×</button></div><label>Название<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>{kind === 'project' ? <label>Адрес<input required maxLength={300} value={address} onChange={e => setAddress(e.target.value)} /></label> : <><label>Описание<textarea rows={5} value={description} onChange={e => setDescription(e.target.value)} /></label><label>Объект<select required value={projectId} onChange={e => setProjectId(e.target.value)}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Исполнитель<select required value={assigneeId} onChange={e => setAssigneeId(e.target.value)}><option value="" disabled>Выберите исполнителя</option>{profiles.filter(p => p.role === 'executor').map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label></>}{error && <div role="alert" className="alert">{error}</div>}<div className="actions end"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button disabled={busy}>Сохранить</button></div></form></div>
}

export default App
