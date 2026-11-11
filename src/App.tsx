import { useState } from 'react'
import { TaskBoard } from './components/TaskBoard'
import { field } from './components/ui'
import { SupabaseProvider } from './context/SupabaseProvider'
import { DemoPanel } from './demo/DemoPanel'
import { createDemoSupabase, DEMO_USER } from './demo/demoData'
import { useProjects } from './hooks/useProjects'
import { createSupabaseClient, isSupabaseConfigured } from './lib/supabase'

// Con .env -> Supabase real. Sin .env -> cliente simulado en memoria (demo).
const demo = isSupabaseConfigured ? null : createDemoSupabase()
const client = demo ? demo.client : createSupabaseClient()

function Workspace() {
  const { projects, isLoading, error } = useProjects()
  const [chosen, setChosen] = useState<string | null>(null)
  const projectId = chosen ?? projects[0]?.id ?? null

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">TaskMaster AI</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Tablero del proyecto</h1>
          <p className="text-sm text-slate-500">{demo ? `Modo demo · sesión de ${DEMO_USER.name}` : 'Conectado a Supabase'}</p>
        </div>
        <label className="text-sm text-slate-600">
          Proyecto
          <select className={`${field} ml-2`} value={projectId ?? ''} onChange={(e) => setChosen(e.target.value)} disabled={isLoading}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </header>

      {error && <p role="alert" className="text-rose-600">{error}</p>}
      {demo && projectId && <DemoPanel fake={demo} projectId={projectId} />}
      {projectId && <TaskBoard projectId={projectId} />}
    </div>
  )
}

export default function App() {
  return (
    <SupabaseProvider client={client}>
      <Workspace />
    </SupabaseProvider>
  )
}
