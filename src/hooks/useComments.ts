import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { toUserMessage } from '../lib/errors'
import type { CommentRow } from '../types/database.types'
import { toComment, type Comment } from '../types/domain'
import { useRealtimeSubscription, type RealtimeBinding } from './useRealtimeSubscription'
import { useSupabase } from './useSupabase'

interface CommentsState {
  taskId: string | null
  comments: Comment[]
  error: string | null
}

const addUnique = (list: Comment[], c: Comment) =>
  list.some((x) => x.id === c.id) ? list : [...list, c].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

/** Comentarios de una tarea, con envío optimista y Realtime (INSERT). */
export function useComments(taskId: string | null) {
  const client = useSupabase()
  const [state, setState] = useState<CommentsState>({ taskId: null, comments: [], error: null })
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    if (!taskId) return
    let active = true
    client
      .from('comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return
        setState({
          taskId,
          comments: (data ?? []).map(toComment),
          error: error ? toUserMessage(error, 'cargar los comentarios') : null,
        })
      })
    return () => {
      active = false
    }
  }, [client, taskId])

  const bindings = useMemo<RealtimeBinding[]>(
    () => (taskId ? [{ event: 'INSERT', table: 'comments', filter: `task_id=eq.${taskId}` }] : []),
    [taskId],
  )

  const handleChange = useCallback((payload: RealtimePostgresChangesPayload<CommentRow>) => {
    if (payload.eventType !== 'INSERT') return
    const comment = toComment(payload.new)
    setState((s) => (s.taskId === comment.taskId ? { ...s, comments: addUnique(s.comments, comment) } : s))
  }, [])

  const realtimeStatus = useRealtimeSubscription<CommentRow>({
    channel: `comments:${taskId ?? 'none'}`,
    bindings,
    onChange: handleChange,
    enabled: taskId !== null,
  })

  const addComment = useCallback(
    async (content: string): Promise<boolean> => {
      const text = content.trim()
      if (!taskId || !text) return false
      setSendError(null)
      const tempId = `temp-${crypto.randomUUID()}`
      const optimistic: Comment = { id: tempId, taskId, authorId: '', content: text, createdAt: new Date() }
      setState((s) => ({ ...s, comments: [...s.comments, optimistic] }))

      const { data, error } = await client.from('comments').insert({ task_id: taskId, content: text }).select().single()

      setState((s) => {
        const withoutTemp = s.comments.filter((c) => c.id !== tempId)
        return { ...s, comments: data && !error ? addUnique(withoutTemp, toComment(data)) : withoutTemp }
      })
      if (error || !data) {
        setSendError(toUserMessage(error, 'enviar el comentario'))
        return false
      }
      return true
    },
    [client, taskId],
  )

  const isCurrent = taskId !== null && state.taskId === taskId
  return {
    comments: isCurrent ? state.comments : [],
    isLoading: taskId !== null && !isCurrent,
    error: isCurrent ? state.error : null,
    sendError,
    realtimeStatus,
    addComment,
  }
}
