import { supabase, type History, type Profile, type Project, type Status, type Task } from './lib'

export type DashboardData = {
  profile: Profile | null
  profiles: Profile[]
  projects: Project[]
  tasks: Task[]
}

export const emptyData: DashboardData = {
  profile: null,
  profiles: [],
  projects: [],
  tasks: [],
}

export async function loadDashboard(userId: string): Promise<DashboardData> {
  const [me, people, objects, work] = await Promise.all([
    supabase.from('profiles').select('id,display_name,role').eq('id', userId).single(),
    supabase.from('profiles').select('id,display_name,role').order('display_name'),
    supabase.from('projects').select('id,name,address,created_at').order('created_at', { ascending: false }),
    supabase.from('tasks').select('id,project_id,title,description,assignee_id,author_id,status,created_at').order('created_at', { ascending: false }),
  ])

  for (const result of [me, people, objects, work]) {
    if (result.error) throw result.error
  }

  return {
    profile: me.data as Profile,
    profiles: people.data as Profile[],
    projects: objects.data as Project[],
    tasks: work.data as Task[],
  }
}

export async function loadTaskHistory(taskId: string): Promise<History[]> {
  const { data, error } = await supabase
    .from('task_history')
    .select('id,task_id,actor_id,from_status,to_status,comment,created_at')
    .eq('task_id', taskId)
    .order('created_at')
    .order('id')
  if (error) throw error
  return data as History[]
}

export async function transitionTask(taskId: string, status: Status, comment: string | null) {
  const { error } = await supabase.rpc('transition_task', {
    p_task_id: taskId,
    p_to_status: status,
    p_comment: comment,
  })
  if (error) throw error
}

export async function deleteRecord(kind: 'project' | 'task', id: string) {
  const { error } = await supabase.rpc(
    kind === 'project' ? 'delete_project' : 'delete_task',
    kind === 'project' ? { p_project_id: id } : { p_task_id: id },
  )
  if (error) throw error
}

export async function saveProject(input: Pick<Project, 'name' | 'address'>, id?: string): Promise<string> {
  const query = id
    ? supabase.from('projects').update(input).eq('id', id).select('id').single()
    : supabase.from('projects').insert(input).select('id').single()
  const { data, error } = await query
  if (error) throw error
  return data.id
}

export async function saveTask(
  input: Pick<Task, 'project_id' | 'title' | 'description' | 'assignee_id'>,
  authorId: string,
  id?: string,
): Promise<string> {
  const query = id
    ? supabase.from('tasks').update(input).eq('id', id).select('id').single()
    : supabase.from('tasks').insert({ ...input, author_id: authorId }).select('id').single()
  const { data, error } = await query
  if (error) throw error
  return data.id
}
