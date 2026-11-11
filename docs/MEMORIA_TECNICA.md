# Memoria Técnica: Persistencia con Custom Hooks

## Por qué esta estructura

El problema de TaskMaster AI era que los componentes llamaban a `supabase-js` directamente. Separé el sistema en tres capas:

1. **Cliente inyectado por contexto** (`SupabaseProvider` + `useSupabase`). Los hooks nunca importan una instancia global, así que en producción reciben el cliente real (anon key + JWT del usuario, con RLS aplicado) y en tests o en la demo reciben un cliente en memoria con la misma API.
2. **Un hook por entidad**: `useTasks(projectId)`, `useComments(taskId)`, `useProfiles()` y `useProjects()`. Cada uno maneja de forma independiente su `data`, `loading` y `error`.
3. **Un hook genérico de Realtime** (`useRealtimeSubscription`). Centraliza crear el canal, registrar los `postgres_changes` y, sobre todo, **eliminarlo en el cleanup** con `removeChannel`. Los handlers se leen por `ref`, así que un cambio de callback no re-suscribe; solo se crea un canal nuevo cuando cambian el proyecto o el filtro.

Los componentes (`TaskBoard`, `TaskCard`) no contienen ni una línea de Supabase: leen estado y llaman a `createTask`, `updateTask` y `deleteTask`.

## Consistencia en tiempo real

El estado vive en un **reducer puro** con acciones explícitas (optimistas, confirmaciones, rollbacks y eventos remotos), lo que elimina las closures obsoletas. Reglas aplicadas:

- **Actualización optimista con rollback.** La UI cambia al instante. Si Supabase o RLS rechaza la operación, se restaura la versión previa, salvo que mientras tanto haya llegado un cambio remoto más nuevo.
- **Sin duplicados.** El eco Realtime de mi propio `INSERT` y la respuesta del `insert()` se fusionan por `id`. La tarea temporal (`temp-…`) se reemplaza por la real.
- **Gana el más reciente.** Cada evento se compara por `updated_at`, que mantiene un trigger en la BD, y los eventos viejos o desordenados se descartan.
- **Re-sincronización.** Si el canal se cae y vuelve a `SUBSCRIBED`, el hook vuelve a consultar y fusiona el resultado, para recuperar los eventos perdidos.
- **Sin carreras.** Cada fetch tiene un flag `active`. Al cambiar de proyecto o desmontar, las respuestas tardías se ignoran y el canal anterior se cierra.
- **Seguridad.** Las consultas filtran por `project_id`, pero la protección real es RLS (`is_project_member`). Un `DELETE` bloqueado por RLS no da error y devuelve 0 filas, así que se detecta con `.select()` y se revierte.

Estas reglas están verificadas con 14 tests automáticos. Al eliminar la limpieza del canal o el control por `updated_at`, 4 de ellos fallan.
