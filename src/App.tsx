import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { deleteRecord, emptyData, loadDashboard, loadTaskHistory, transitionTask, type DashboardData } from './api'
import { Editor } from './Editor'
import { Login } from './Login'
import { Empty, TaskDetails, TaskHistory, TaskList } from './TaskViews'
import { configured, errorMessage, nextStatus, statusLabel, supabase, type History, type Status, type Task } from './lib'

type EditKind = 'project' | 'task'

function navigate(path: string) {
  window.location.hash = path
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [route, setRoute] = useState(window.location.hash.slice(1) || 'objects')
  const [data, setData] = useState<DashboardData>(emptyData)
  const [dataFor, setDataFor] = useState<string | null>(null)
  const [history, setHistory] = useState<History[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<{ kind: EditKind; id?: string } | null>(null)
  const dataRequest = useRef(0)
  const userId = session?.user.id ?? null

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.slice(1) || 'objects')
    window.addEventListener('hashchange', onHashChange)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setAuthReady(true)
    })
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      listener.subscription.unsubscribe()
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!userId) return
    const request = ++dataRequest.current
    setLoading(true)
    setError('')
    try {
      const result = await loadDashboard(userId)
      if (request === dataRequest.current) {
        setData(result)
        setDataFor(userId)
      }
    } catch (cause) {
      if (request === dataRequest.current) setError(errorMessage(cause))
    } finally {
      if (request === dataRequest.current) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    dataRequest.current++
    setData(emptyData)
    setDataFor(null)
    setHistory([])
    if (userId) void refresh()
    return () => { dataRequest.current++ }
  }, [userId, refresh])

  useEffect(() => {
    const taskId = route.startsWith('task/') ? route.slice(5) : null
    if (!userId || dataFor !== userId || !taskId) {
      setHistory([])
      return
    }
    let active = true
    setHistory([])
    loadTaskHistory(taskId).then(
      (events) => { if (active) setHistory(events) },
      (cause) => { if (active) setError(errorMessage(cause)) },
    )
    return () => { active = false }
  }, [route, userId, dataFor, data.tasks])

  async function runAction(work: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await work()
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function transition(task: Task, status: Status) {
    let comment: string | null = null
    if (status === 'rework') {
      comment = window.prompt('Причина возврата на доработку:')
      if (comment === null) return
      if (!comment.trim()) {
        setError('Укажите комментарий для доработки.')
        return
      }
    }
    await runAction(() => transitionTask(task.id, status, comment))
  }

  async function remove(kind: EditKind, id: string) {
    const question = kind === 'project' ? 'Удалить объект и скрыть все его задачи?' : 'Удалить задачу?'
    if (!window.confirm(question)) return
    await runAction(async () => {
      await deleteRecord(kind, id)
      navigate('objects')
    })
  }

  if (!configured) {
    return <main className="center"><section className="panel"><h1>Нужна настройка Supabase</h1><p>Добавьте URL проекта и publishable key в <code>.env.local</code> по образцу <code>.env.example</code>, затем перезапустите приложение.</p></section></main>
  }
  if (!authReady) return <main className="center">Загрузка…</main>
  if (!session) return <Login />
  if (dataFor !== userId) {
    return <main className="center">{error ? <section className="panel"><p role="alert">{error}</p><button onClick={() => void refresh()}>Повторить</button></section> : 'Загрузка…'}</main>
  }

  const manager = data.profile?.role === 'manager'
  const person = (id: string) => data.profiles.find((profile) => profile.id === id)?.display_name || 'Пользователь'
  const project = (id: string) => data.projects.find((item) => item.id === id)
  const task = route.startsWith('task/') ? data.tasks.find((item) => item.id === route.slice(5)) : undefined
  const currentProject = route.startsWith('object/') ? project(route.slice(7)) : undefined
  const transitions = task && (manager ? task.status === 'review' : task.assignee_id === userId && task.status !== 'review')
    ? nextStatus[task.status] || []
    : []

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Объекты и задачи</div>
        <div className="user">
          {data.profile?.display_name || session.user.email}
          <span className="role">{manager ? 'Постановщик' : 'Исполнитель'}</span>
          <button className="text-button" onClick={() => void supabase.auth.signOut()}>Выйти</button>
        </div>
      </header>

      <div className="layout">
        <nav className="sidebar">
          <a className={route === 'objects' ? 'active' : ''} href="#objects">Объекты</a>
          {!manager && <a className={route === 'my' ? 'active' : ''} href="#my">Мои задачи</a>}
        </nav>

        <main className="content">
          {error && <div role="alert" className="alert">{error}<button aria-label="Закрыть" onClick={() => setError('')}>×</button></div>}
          {loading && <div className="muted">Обновление…</div>}

          {route === 'objects' && (
            <>
              <div className="heading">
                <div><h1>Объекты</h1><p>Стройки и задачи по ним</p></div>
                {manager && <button onClick={() => setEditing({ kind: 'project' })}>Добавить объект</button>}
              </div>
              {data.projects.length === 0 ? <Empty text="Объектов пока нет" /> : (
                <div className="cards">
                  {data.projects.map((item) => (
                    <a className="card" href={'#object/' + item.id} key={item.id}>
                      <h2>{item.name}</h2>
                      <p>{item.address}</p>
                      <span className="muted">Задач: {data.tasks.filter((work) => work.project_id === item.id).length}</span>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}

          {route === 'my' && !manager && (
            <>
              <div className="heading"><div><h1>Мои задачи</h1><p>Задачи, назначенные вам</p></div></div>
              <TaskList tasks={data.tasks} project={project} />
            </>
          )}

          {route.startsWith('object/') && (currentProject ? (
            <>
              <a className="back" href="#objects">← Объекты</a>
              <div className="heading">
                <div><h1>{currentProject.name}</h1><p>{currentProject.address}</p></div>
                {manager && (
                  <div className="actions">
                    <button className="secondary" onClick={() => setEditing({ kind: 'project', id: currentProject.id })}>Изменить</button>
                    <button className="danger" disabled={busy} onClick={() => void remove('project', currentProject.id)}>Удалить</button>
                  </div>
                )}
              </div>
              <div className="heading subheading">
                <h2>Задачи</h2>
                {manager && <button onClick={() => setEditing({ kind: 'task' })}>Добавить задачу</button>}
              </div>
              <TaskList tasks={data.tasks.filter((work) => work.project_id === currentProject.id)} project={project} person={person} />
            </>
          ) : <Empty text="Объект не найден или недоступен" />)}

          {route.startsWith('task/') && (task ? (
            <>
              <a className="back" href={'#object/' + task.project_id}>← {project(task.project_id)?.name || 'Объект'}</a>
              <div className="heading">
                <div><h1>{task.title}</h1><span className={'badge ' + task.status}>{statusLabel[task.status]}</span></div>
                {manager && (
                  <div className="actions">
                    <button className="secondary" onClick={() => setEditing({ kind: 'task', id: task.id })}>Изменить</button>
                    <button className="danger" disabled={busy} onClick={() => void remove('task', task.id)}>Удалить</button>
                  </div>
                )}
              </div>
              <TaskDetails task={task} projectName={project(task.project_id)?.name} assigneeName={person(task.assignee_id)} authorName={person(task.author_id)} />
              <div className="actions transition-actions">
                {transitions.map((status) => (
                  <button key={status} disabled={busy} onClick={() => void transition(task, status)}>
                    {status === 'rework' ? 'Вернуть на доработку' : status === 'accepted' ? 'Принять' : status === 'review' ? 'Отправить на проверку' : 'Взять в работу'}
                  </button>
                ))}
              </div>
              <h2>История статусов</h2>
              <TaskHistory events={history} person={person} />
            </>
          ) : <Empty text="Задача не найдена или недоступна" />)}
        </main>
      </div>

      {editing && (
        <Editor
          kind={editing.kind}
          item={editing.id ? (editing.kind === 'project'
            ? data.projects.find((item) => item.id === editing.id)
            : data.tasks.find((item) => item.id === editing.id)) : undefined}
          projects={data.projects}
          profiles={data.profiles}
          defaultProjectId={currentProject?.id}
          userId={session.user.id}
          onClose={() => setEditing(null)}
          onSaved={async (id, kind) => {
            setEditing(null)
            await refresh()
            navigate(kind === 'project' ? 'object/' + id : 'task/' + id)
          }}
        />
      )}
    </div>
  )
}

export default App
