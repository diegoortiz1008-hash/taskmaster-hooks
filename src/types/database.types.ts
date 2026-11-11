/**
 * Tipos de la base de datos (subset usado por el frontend).
 * Regenerar con: npx supabase gen types typescript --linked > src/types/database.types.ts
 */
export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; full_name: string; avatar_url: string | null; created_at: string }
        Insert: { id: string; full_name: string; avatar_url?: string | null; created_at?: string }
        Update: { full_name?: string; avatar_url?: string | null }
        Relationships: []
      }
      projects: {
        Row: { id: string; name: string; owner_id: string; created_at: string }
        Insert: { id?: string; name: string; owner_id: string; created_at?: string }
        Update: { name?: string }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          project_id: string
          title: string
          description: string | null
          status: TaskStatus
          priority: TaskPriority
          assignee_id: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          title: string
          description?: string | null
          status?: TaskStatus
          priority?: TaskPriority
          assignee_id?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          description?: string | null
          status?: TaskStatus
          priority?: TaskPriority
          assignee_id?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: { id: string; task_id: string; author_id: string; content: string; created_at: string }
        Insert: { id?: string; task_id: string; author_id?: string; content: string; created_at?: string }
        Update: { content?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { task_status: TaskStatus; task_priority: TaskPriority }
    CompositeTypes: { [_ in never]: never }
  }
}

type Tables = Database['public']['Tables']
export type TaskRow = Tables['tasks']['Row']
export type TaskInsert = Tables['tasks']['Insert']
export type TaskUpdate = Tables['tasks']['Update']
export type CommentRow = Tables['comments']['Row']
export type ProfileRow = Tables['profiles']['Row']
export type ProjectRow = Tables['projects']['Row']
