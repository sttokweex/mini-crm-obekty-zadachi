import { useState, type FormEvent } from 'react'
import { saveProject, saveTask } from './api'
import { errorMessage, type Profile, type Project, type Task } from './lib'

type Kind = 'project' | 'task'

type EditorProps = {
  kind: Kind
  item?: Project | Task
  projects: Project[]
  profiles: Profile[]
  defaultProjectId?: string
  userId: string
  onClose: () => void
  onSaved: (id: string, kind: Kind) => Promise<void>
}

export function Editor({ kind, item, projects, profiles, defaultProjectId, userId, onClose, onSaved }: EditorProps) {
  const existingProject = kind === 'project' ? item as Project | undefined : undefined
  const existingTask = kind === 'task' ? item as Task | undefined : undefined
  const [name, setName] = useState(existingProject?.name || existingTask?.title || '')
  const [address, setAddress] = useState(existingProject?.address || '')
  const [description, setDescription] = useState(existingTask?.description || '')
  const [projectId, setProjectId] = useState(existingTask?.project_id || defaultProjectId || projects[0]?.id || '')
  const [assigneeId, setAssigneeId] = useState(existingTask?.assignee_id || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (kind === 'project') {
        const id = await saveProject({ name: name.trim(), address: address.trim() }, existingProject?.id)
        await onSaved(id, kind)
      } else {
        if (!projectId || !assigneeId) throw new Error('Выберите объект и исполнителя.')
        const id = await saveTask({
          project_id: projectId,
          title: name.trim(),
          description: description.trim(),
          assignee_id: assigneeId,
        }, userId, existingTask?.id)
        await onSaved(id, kind)
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="panel editor" onSubmit={(event) => void submit(event)}>
        <div className="heading">
          <h2>{item ? 'Изменить' : 'Создать'} {kind === 'project' ? 'объект' : 'задачу'}</h2>
          <button type="button" className="icon" aria-label="Закрыть" onClick={onClose}>×</button>
        </div>
        <label>
          Название
          <input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {kind === 'project' ? (
          <label>
            Адрес
            <input required maxLength={300} value={address} onChange={(event) => setAddress(event.target.value)} />
          </label>
        ) : (
          <>
            <label>
              Описание
              <textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label>
              Объект
              <select required value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
            <label>
              Исполнитель
              <select required value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                <option value="" disabled>Выберите исполнителя</option>
                {profiles.filter((profile) => profile.role === 'executor').map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.display_name}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {error && <div role="alert" className="alert">{error}</div>}
        <div className="actions end">
          <button type="button" className="secondary" onClick={onClose}>Отмена</button>
          <button disabled={busy}>Сохранить</button>
        </div>
      </form>
    </div>
  )
}
