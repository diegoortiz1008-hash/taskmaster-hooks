-- =============================================================================
-- TaskMaster AI · Esquema de referencia (el backend ya existe; se documenta
-- aquí para que los hooks y las políticas RLS sean verificables).
-- Entidades: profiles (usuarios), projects, project_members, tasks, comments
-- =============================================================================

create type public.task_status   as enum ('todo', 'in_progress', 'done');
create type public.task_priority as enum ('low', 'medium', 'high');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(trim(full_name)) between 2 and 100),
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 2 and 120),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'member')),
  primary key (project_id, user_id)
);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  title        text not null check (char_length(trim(title)) between 1 and 200),
  description  text check (char_length(description) <= 5000),
  status       public.task_status   not null default 'todo',
  priority     public.task_priority not null default 'medium',
  assignee_id  uuid references public.profiles (id) on delete set null,
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  content     text not null check (char_length(trim(content)) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index tasks_project_id_idx      on public.tasks (project_id, created_at desc);
create index tasks_assignee_id_idx     on public.tasks (assignee_id);
create index comments_task_id_idx      on public.comments (task_id, created_at);
create index project_members_user_idx  on public.project_members (user_id);

-- updated_at: base para resolver conflictos en tiempo real (gana la versión más reciente)
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ¿El usuario actual pertenece al proyecto? (SECURITY DEFINER evita RLS recursivo)
create or replace function public.is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project_id and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_project_member(uuid) from public, anon;
grant  execute on function public.is_project_member(uuid) to authenticated;

-- ------------------------------------------------------------------- RLS ----
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks           enable row level security;
alter table public.comments        enable row level security;

revoke all on public.profiles, public.projects, public.project_members, public.tasks, public.comments from anon;

create policy "profiles: autenticados leen perfiles" on public.profiles
  for select to authenticated using (true);

create policy "projects: miembros leen sus proyectos" on public.projects
  for select to authenticated using (public.is_project_member(id));

create policy "project_members: miembros ven a su equipo" on public.project_members
  for select to authenticated using (public.is_project_member(project_id));

create policy "tasks: miembros leen tareas del proyecto" on public.tasks
  for select to authenticated using (public.is_project_member(project_id));

create policy "tasks: miembros crean tareas en su proyecto" on public.tasks
  for insert to authenticated
  with check (public.is_project_member(project_id) and created_by = (select auth.uid()));

create policy "tasks: miembros actualizan tareas del proyecto" on public.tasks
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy "tasks: miembros eliminan tareas del proyecto" on public.tasks
  for delete to authenticated using (public.is_project_member(project_id));

create policy "comments: miembros leen comentarios" on public.comments
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and public.is_project_member(t.project_id)));

create policy "comments: miembros comentan en nombre propio" on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and public.is_project_member(t.project_id))
  );

-- ------------------------------------------------------------- Realtime ----
-- REPLICA IDENTITY FULL: los eventos UPDATE/DELETE incluyen la fila anterior
-- completa (project_id), necesario para saber de qué proyecto salió una tarea.
alter table public.tasks    replica identity full;
alter table public.comments replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tasks, public.comments;
  end if;
end $$;
