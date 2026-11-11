import { createFakeSupabase } from '../lib/fakeSupabase'

export const DEMO_USER = { id: 'u-ana', name: 'Ana Torres (tú)' }
export const OTHER_USER = { id: 'u-beto', name: 'Beto Ruiz' }

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const task = (id: string, project_id: string, title: string, status: string, priority: string, assignee_id: string | null, min: number) => ({
  id, project_id, title, description: null, status, priority, assignee_id, created_by: OTHER_USER.id, created_at: ago(min), updated_at: ago(min),
})

/** Cliente simulado con datos de ejemplo y latencia de red realista. */
export function createDemoSupabase() {
  return createFakeSupabase({
    currentUserId: DEMO_USER.id,
    latency: 450,
    seed: {
      profiles: [
        { id: DEMO_USER.id, full_name: DEMO_USER.name, avatar_url: null, created_at: ago(9000) },
        { id: OTHER_USER.id, full_name: OTHER_USER.name, avatar_url: null, created_at: ago(9000) },
        { id: 'u-carla', full_name: 'Carla Méndez', avatar_url: null, created_at: ago(9000) },
      ],
      projects: [
        { id: 'p-web', name: 'Lanzamiento App Web', owner_id: DEMO_USER.id, created_at: ago(5000) },
        { id: 'p-mobile', name: 'Portal Móvil v2', owner_id: OTHER_USER.id, created_at: ago(4000) },
      ],
      tasks: [
        task('t-1', 'p-web', 'Definir contrato de hooks (useTasks)', 'done', 'high', DEMO_USER.id, 300),
        task('t-2', 'p-web', 'Configurar políticas RLS de tasks', 'in_progress', 'high', OTHER_USER.id, 240),
        task('t-3', 'p-web', 'Suscripción Realtime con limpieza', 'in_progress', 'medium', DEMO_USER.id, 180),
        task('t-4', 'p-web', 'Diseñar tablero Kanban', 'todo', 'medium', 'u-carla', 120),
        task('t-5', 'p-web', 'Escribir memoria técnica', 'todo', 'low', null, 60),
        task('t-6', 'p-mobile', 'Push notifications', 'todo', 'high', OTHER_USER.id, 90),
        task('t-7', 'p-mobile', 'Modo offline', 'in_progress', 'medium', 'u-carla', 45),
      ],
      comments: [
        { id: 'c-1', task_id: 't-2', author_id: OTHER_USER.id, content: '¿Usamos una función is_project_member()?', created_at: ago(200) },
        { id: 'c-2', task_id: 't-2', author_id: DEMO_USER.id, content: 'Sí, SECURITY DEFINER para evitar RLS recursivo.', created_at: ago(190) },
      ],
    },
  })
}
