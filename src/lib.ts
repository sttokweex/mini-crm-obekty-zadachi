import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const configured = Boolean(url && key && !url.includes('your-project'))
export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder')

export type Status = 'new' | 'in_progress' | 'review' | 'accepted' | 'rework'
export type Role = 'manager' | 'executor'
export type Profile = { id: string; display_name: string; role: Role }
export type Project = { id: string; name: string; address: string; created_at: string }
export type Task = {
  id: string; project_id: string; title: string; description: string; assignee_id: string;
  author_id: string; status: Status; created_at: string
}
export type History = {
  id: string; task_id: string; actor_id: string; from_status: Status | null;
  to_status: Status; comment: string | null; created_at: string
}
export const statusLabel: Record<Status, string> = {
  new: 'Новая', in_progress: 'В работе', review: 'На проверке',
  accepted: 'Принята', rework: 'На доработке'
}
export const nextStatus: Partial<Record<Status, Status[]>> = {
  new: ['in_progress'], in_progress: ['review'], review: ['accepted', 'rework'], rework: ['in_progress']
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
