import type { CommentRow, ProfileRow, ProjectRow, TaskPriority, TaskRow, TaskStatus } from './database.types'

export type { TaskPriority, TaskStatus }

/** Modelo de dominio de una tarea (camelCase, fechas como Date). */
export interface Task {
  id: string
  projectId: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface NewTask {
  title: string
  description?: string | null
  priority?: TaskPriority
  assigneeId?: string | null
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assigneeId'>>

export interface Comment {
  id: string
  taskId: string
  authorId: string
  content: string
  createdAt: Date
}

export interface Profile {
  id: string
  fullName: string
  avatarUrl: string | null
}

// ---------------- Mappers BD <-> dominio ----------------
export const toTask = (row: TaskRow): Task => ({
  id: row.id,
  projectId: row.project_id,
  title: row.title,
  description: row.description,
  status: row.status,
  priority: row.priority,
  assigneeId: row.assignee_id,
  createdBy: row.created_by,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
})

export const toTaskUpdate = (patch: TaskPatch) => ({
  ...(patch.title !== undefined && { title: patch.title.trim() }),
  ...(patch.description !== undefined && { description: patch.description }),
  ...(patch.status !== undefined && { status: patch.status }),
  ...(patch.priority !== undefined && { priority: patch.priority }),
  ...(patch.assigneeId !== undefined && { assignee_id: patch.assigneeId }),
})

export const toComment = (row: CommentRow): Comment => ({
  id: row.id,
  taskId: row.task_id,
  authorId: row.author_id,
  content: row.content,
  createdAt: new Date(row.created_at),
})

export const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  fullName: row.full_name,
  avatarUrl: row.avatar_url,
})

export interface Project {
  id: string
  name: string
}

export const toProject = (row: Pick<ProjectRow, 'id' | 'name'>): Project => ({ id: row.id, name: row.name })
