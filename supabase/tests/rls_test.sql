-- Prueba de RLS en PostgreSQL "puro". Simula lo mínimo de Supabase y
-- verifica que un usuario solo opere sobre tareas de proyectos donde es miembro.
\set ON_ERROR_STOP on

-- ---- Simulación de Supabase ----
create role anon nologin;
create role authenticated nologin;
create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;

\ir ../migrations/20261111150000_taskmaster_schema.sql

-- ---- Datos ----
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.profiles (id, full_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana'), ('bbbbbbbb-0000-0000-0000-000000000002', 'Beto');
insert into public.projects (id, name, owner_id) values
  ('11111111-0000-0000-0000-000000000001', 'Proyecto de Ana', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000002', 'Proyecto de Beto', 'bbbbbbbb-0000-0000-0000-000000000002');
insert into public.project_members values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner'),
  ('22222222-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'owner');
insert into public.tasks (project_id, title, created_by) values
  ('22222222-0000-0000-0000-000000000002', 'Tarea privada de Beto', 'bbbbbbbb-0000-0000-0000-000000000002');

-- ---- Como Ana ----
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \gset
set role authenticated;

insert into public.tasks (project_id, title) values ('11111111-0000-0000-0000-000000000001', 'Diseñar hooks');
do $$ begin raise notice 'OK 1 Ana crea tarea en su proyecto (created_by = auth.uid() por defecto)'; end $$;

do $$ begin
  assert (select count(*) from public.tasks) = 1, 'FALLO: Ana ve tareas ajenas';
  raise notice 'OK 2 Ana solo ve las tareas de su proyecto (1 de 2)';
end $$;

do $$ begin
  begin
    insert into public.tasks (project_id, title) values ('22222222-0000-0000-0000-000000000002', 'Intrusa');
    raise exception 'FALLO: insertó en proyecto ajeno';
  exception when insufficient_privilege then
    raise notice 'OK 3 RLS bloquea crear tareas en un proyecto ajeno';
  end;
end $$;

do $$
declare n int;
begin
  update public.tasks set status = 'done' where title = 'Tarea privada de Beto';
  get diagnostics n = row_count;
  assert n = 0, 'FALLO: actualizó tarea ajena';
  delete from public.tasks where title = 'Tarea privada de Beto';
  get diagnostics n = row_count;
  assert n = 0, 'FALLO: borró tarea ajena';
  raise notice 'OK 4 no puede actualizar ni borrar tareas ajenas (0 filas)';
end $$;

do $$
declare before_ts timestamptz;
begin
  select updated_at into before_ts from public.tasks where title = 'Diseñar hooks';
  perform pg_sleep(0.01);
  update public.tasks set status = 'in_progress' where title = 'Diseñar hooks';
  assert (select updated_at from public.tasks where title = 'Diseñar hooks') > before_ts, 'FALLO: updated_at';
  raise notice 'OK 5 trigger updated_at avanza en cada UPDATE';
end $$;

insert into public.comments (task_id, content)
  select id, 'Primer comentario' from public.tasks where title = 'Diseñar hooks';
do $$ begin raise notice 'OK 6 Ana comenta en su tarea'; end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
set role anon;
do $$ begin
  begin
    perform 1 from public.tasks;
    raise exception 'FALLO: anon leyó tareas';
  exception when insufficient_privilege then
    raise notice 'OK 7 usuarios anónimos no acceden a tareas';
  end;
end $$;
reset role;

do $$ begin raise notice '=== RLS: TODAS LAS PRUEBAS PASARON ==='; end $$;
