create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('manager', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  role public.app_role not null default 'executor'
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  address text not null check (length(trim(address)) between 1 and 300),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '',
  assignee_id uuid not null references public.profiles(id),
  author_id uuid not null references public.profiles(id),
  status public.task_status not null default 'new',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id),
  actor_id uuid not null references public.profiles(id),
  from_status public.task_status,
  to_status public.task_status not null,
  comment text,
  created_at timestamptz not null default now()
);

create index tasks_project_idx on public.tasks(project_id) where deleted_at is null;
create index tasks_assignee_idx on public.tasks(assignee_id) where deleted_at is null;
create index history_task_time_idx on public.task_history(task_id, created_at, id);

create function private.is_manager() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'manager') $$;

create function private.is_executor(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = p_id and role = 'executor') $$;

create function private.project_is_active(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.projects where id = p_id and deleted_at is null) $$;

create function private.validate_task() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.project_is_active(new.project_id) then
    raise exception 'Object does not exist or is deleted';
  end if;
  if not private.is_executor(new.assignee_id) then
    raise exception 'Assignee must be an executor';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'new' or new.author_id <> auth.uid() then
      raise exception 'New tasks must start as new and belong to the current author';
    end if;
    new.created_at := now();
  else
    if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
      raise exception 'Author and creation time are immutable';
    end if;
  end if;
  return new;
end $$;

-- Authenticated clients have no UPDATE privilege on status. The only status write path is transition_task.
create trigger validate_task_before_write before insert or update on public.tasks
for each row execute function private.validate_task();

create function private.record_task_creation() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.task_history(task_id, actor_id, from_status, to_status)
  values (new.id, new.author_id, null, 'new');
  return new;
end $$;
create trigger record_task_creation_after_insert after insert on public.tasks
for each row execute function private.record_task_creation();

create function public.transition_task(p_task_id uuid, p_to_status public.task_status, p_comment text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_actor uuid := auth.uid();
  v_manager boolean;
begin
  if v_actor is null then raise exception 'Sign in required'; end if;
  select * into v_task from public.tasks where id = p_task_id and deleted_at is null for update;
  if not found or not private.project_is_active(v_task.project_id) then raise exception 'Task not found'; end if;
  v_manager := private.is_manager();

  if v_task.status = 'new' and p_to_status = 'in_progress'
    or v_task.status = 'in_progress' and p_to_status = 'review'
    or v_task.status = 'rework' and p_to_status = 'in_progress' then
    if v_task.assignee_id <> v_actor then raise exception 'Only the assigned executor can do this'; end if;
  elsif v_task.status = 'review' and p_to_status in ('accepted', 'rework') then
    if not v_manager then raise exception 'Only a manager can do this'; end if;
    if p_to_status = 'rework' and nullif(trim(p_comment), '') is null then
      raise exception 'A comment is required for rework';
    end if;
  else
    raise exception 'Status transition is not allowed';
  end if;

  update public.tasks set status = p_to_status where id = p_task_id;
  insert into public.task_history(task_id, actor_id, from_status, to_status, comment)
  values (p_task_id, v_actor, v_task.status, p_to_status, nullif(trim(p_comment), ''));
end $$;

create function public.delete_task(p_task_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_manager() then raise exception 'Only a manager can delete tasks'; end if;
  update public.tasks set deleted_at = now() where id = p_task_id and deleted_at is null;
  if not found then raise exception 'Task not found'; end if;
end $$;

create function public.delete_project(p_project_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_manager() then raise exception 'Only a manager can delete objects'; end if;
  if not exists (select 1 from public.projects where id = p_project_id and deleted_at is null for update) then
    raise exception 'Object not found';
  end if;
  update public.tasks set deleted_at = now() where project_id = p_project_id and deleted_at is null;
  update public.projects set deleted_at = now() where id = p_project_id;
end $$;

create function private.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name, role)
  values (new.id, coalesce(nullif(split_part(new.email, '@', 1), ''), 'Пользователь'), 'executor');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.on_auth_user_created();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid()) or private.is_manager() or exists (
    select 1 from public.tasks t where t.assignee_id = (select auth.uid())
      and t.deleted_at is null and private.project_is_active(t.project_id)
      and t.author_id = profiles.id
  ) or exists (
    select 1 from public.task_history h
    join public.tasks t on t.id = h.task_id
    where t.assignee_id = (select auth.uid()) and t.deleted_at is null
      and private.project_is_active(t.project_id) and h.actor_id = profiles.id
  )
);
create policy projects_read on public.projects for select to authenticated using (
  deleted_at is null and (private.is_manager() or exists (
    select 1 from public.tasks t where t.project_id = projects.id
      and t.assignee_id = (select auth.uid()) and t.deleted_at is null
  ))
);
create policy projects_create on public.projects for insert to authenticated
with check (private.is_manager() and deleted_at is null);
create policy projects_edit on public.projects for update to authenticated
using (private.is_manager() and deleted_at is null)
with check (private.is_manager() and deleted_at is null);

create policy tasks_read on public.tasks for select to authenticated using (
  deleted_at is null and private.project_is_active(project_id)
  and (private.is_manager() or assignee_id = (select auth.uid()))
);
create policy tasks_create on public.tasks for insert to authenticated
with check (private.is_manager() and deleted_at is null and status = 'new'
  and author_id = (select auth.uid()) and private.is_executor(assignee_id)
  and private.project_is_active(project_id));
create policy tasks_edit on public.tasks for update to authenticated
using (private.is_manager() and deleted_at is null)
with check (private.is_manager() and deleted_at is null
  and private.is_executor(assignee_id) and private.project_is_active(project_id));

create policy history_read on public.task_history for select to authenticated using (
  exists (select 1 from public.tasks t where t.id = task_id)
);

revoke all on public.profiles, public.projects, public.tasks, public.task_history from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert on public.projects to authenticated;
grant update(name, address) on public.projects to authenticated;
grant select, insert on public.tasks to authenticated;
grant update(project_id, title, description, assignee_id) on public.tasks to authenticated;
grant select on public.task_history to authenticated;
revoke all on function public.transition_task(uuid, public.task_status, text) from public, anon;
revoke all on function public.delete_task(uuid) from public, anon;
revoke all on function public.delete_project(uuid) from public, anon;
grant execute on function public.transition_task(uuid, public.task_status, text) to authenticated;
grant execute on function public.delete_task(uuid), public.delete_project(uuid) to authenticated;
