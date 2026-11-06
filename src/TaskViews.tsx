import { statusLabel, type History, type Project, type Task } from './lib'

const formatDate = (value: string) => new Date(value).toLocaleString('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function Empty({ text }: { text: string }) {
  return <div className="panel empty">{text}</div>
}

export function TaskList({ tasks, project, person }: {
  tasks: Task[]
  project: (id: string) => Project | undefined
  person?: (id: string) => string
}) {
  if (!tasks.length) return <Empty text="Задач пока нет" />

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <a href={'#task/' + task.id} className="task-row" key={task.id}>
          <div>
            <strong>{task.title}</strong>
            <div className="muted">
              {project(task.project_id)?.name}{person && ' · ' + person(task.assignee_id)}
            </div>
          </div>
          <span className={'badge ' + task.status}>{statusLabel[task.status]}</span>
        </a>
      ))}
    </div>
  )
}

export function TaskHistory({ events, person }: {
  events: History[]
  person: (id: string) => string
}) {
  return (
    <section className="panel history">
      {events.length === 0 ? <p className="muted">Записей пока нет</p> : events.map((event) => (
        <div className="event" key={event.id}>
          <div className="event-line">
            <strong>{event.from_status ? statusLabel[event.from_status] + ' → ' : 'Создана → '}{statusLabel[event.to_status]}</strong>
            <time>{formatDate(event.created_at)}</time>
          </div>
          <div className="muted">{person(event.actor_id)}</div>
          {event.comment && <p>{event.comment}</p>}
        </div>
      ))}
    </section>
  )
}

export function TaskDetails({ task, projectName, assigneeName, authorName }: {
  task: Task
  projectName?: string
  assigneeName: string
  authorName: string
}) {
  return (
    <section className="panel details">
      <p className="description">{task.description || 'Описание не указано'}</p>
      <dl>
        <div><dt>Объект</dt><dd>{projectName}</dd></div>
        <div><dt>Исполнитель</dt><dd>{assigneeName}</dd></div>
        <div><dt>Автор</dt><dd>{authorName}</dd></div>
        <div><dt>Создана</dt><dd>{formatDate(task.created_at)}</dd></div>
      </dl>
    </section>
  )
}
