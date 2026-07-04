import { createClient } from '@supabase/supabase-js'
import type { Teacher, Request, TeacherStats } from './types'
import { randomUUID } from 'crypto'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getTeachers(): Promise<Teacher[]> {
  const { data, error } = await getSupabase().from('teachers').select('*').order('id')
  if (error) throw error
  return data ?? []
}

export async function getTeacher(id: string): Promise<Teacher | null> {
  const { data } = await getSupabase().from('teachers').select('*').eq('id', id).single()
  return data
}

export async function getFreeTeachers(dayOfWeek: string, period: number): Promise<Teacher[]> {
  const supabase = getSupabase()
  const [teachersResult, busyResult] = await Promise.all([
    supabase.from('teachers').select('*').order('id'),
    supabase.from('timetable').select('teacher_id')
      .eq('day_of_week', dayOfWeek)
      .eq('period', period)
  ])
  if (teachersResult.error) throw teachersResult.error
  const busyIds = new Set((busyResult.data ?? []).map((r: { teacher_id: string }) => r.teacher_id))
  return (teachersResult.data ?? []).filter((t: Teacher) => !busyIds.has(t.id))
}

export async function createRequest(
  targetDate: string,
  period: number,
  requesterId: string,
  reason: string,
  note: string,
  deadlineHours = 4
): Promise<Request> {
  const deadline = new Date(Date.now() + deadlineHours * 3_600_000).toISOString()
  const id = `REQ-${Date.now()}`
  const { data, error } = await getSupabase()
    .from('requests')
    .insert({ id, target_date: targetDate, period, requester_id: requesterId, reason, note, deadline })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createToken(requestId: string, teacherId: string): Promise<string> {
  const id = randomUUID()
  const { error } = await getSupabase()
    .from('tokens')
    .insert({ id, request_id: requestId, teacher_id: teacherId })
  if (error) throw error
  return id
}

export async function acceptRequest(
  tokenId: string
): Promise<{ success: boolean; error?: string; request?: Request }> {
  const supabase = getSupabase()

  // Optimistic lock: mark token used only if currently unused
  const { data: tokenData, error: tokenErr } = await supabase
    .from('tokens')
    .update({ used: true })
    .eq('id', tokenId)
    .eq('used', false)
    .select()
    .single()

  if (tokenErr || !tokenData) {
    const { data: existing } = await supabase.from('tokens').select('id').eq('id', tokenId).single()
    if (!existing) return { success: false, error: 'トークンが無効です' }
    return { success: false, error: 'このリンクは既に使用済みです' }
  }

  // Optimistic lock: update request only if still open
  const now = new Date().toISOString()
  const { data: req, error: reqErr } = await supabase
    .from('requests')
    .update({ status: '確定', acceptor_id: tokenData.teacher_id, accepted_at: now })
    .eq('id', tokenData.request_id)
    .eq('status', '募集中')
    .select()
    .single()

  if (reqErr || !req) {
    // Rollback token
    await supabase.from('tokens').update({ used: false }).eq('id', tokenId)
    return { success: false, error: 'この依頼は既に他の先生が受諾しました' }
  }

  // Invalidate remaining tokens for this request
  await supabase
    .from('tokens')
    .update({ used: true })
    .eq('request_id', tokenData.request_id)
    .neq('id', tokenId)

  return { success: true, request: req }
}

export async function declineToken(
  tokenId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('tokens')
    .update({ used: true })
    .eq('id', tokenId)
    .eq('used', false)
    .select()
    .single()

  if (error || !data) {
    const { data: existing } = await supabase.from('tokens').select('id').eq('id', tokenId).single()
    if (!existing) return { success: false, error: 'トークンが無効です' }
    return { success: false, error: 'このリンクは既に使用済みです' }
  }

  // If all tokens for this request are now used, mark as expired
  const { count } = await supabase
    .from('tokens')
    .select('*', { count: 'exact', head: true })
    .eq('request_id', data.request_id)
    .eq('used', false)

  if ((count ?? 0) === 0) {
    await supabase
      .from('requests')
      .update({ status: '期限切れ' })
      .eq('id', data.request_id)
      .eq('status', '募集中')
  }

  return { success: true }
}

export async function getRecentRequests(limit = 50) {
  const { data, error } = await getSupabase()
    .from('requests')
    .select(`
      *,
      requester:teachers!requests_requester_id_fkey(id, name),
      acceptor:teachers!requests_acceptor_id_fkey(id, name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function getTeacherStats(): Promise<TeacherStats[]> {
  const supabase = getSupabase()
  const [teachers, tokensResult, fulfilledResult] = await Promise.all([
    getTeachers(),
    supabase.from('tokens').select('teacher_id'),
    supabase.from('requests').select('acceptor_id').eq('status', '確定')
  ])

  const sentMap: Record<string, number> = {}
  const doneMap: Record<string, number> = {}

  tokensResult.data?.forEach((t: { teacher_id: string }) => {
    sentMap[t.teacher_id] = (sentMap[t.teacher_id] ?? 0) + 1
  })
  fulfilledResult.data?.forEach((r: { acceptor_id: string | null }) => {
    if (r.acceptor_id) doneMap[r.acceptor_id] = (doneMap[r.acceptor_id] ?? 0) + 1
  })

  return teachers.map(t => ({
    id: t.id,
    name: t.name,
    sent_count: sentMap[t.id] ?? 0,
    done_count: doneMap[t.id] ?? 0,
  }))
}

export async function checkExpiredRequests(): Promise<Request[]> {
  const { data } = await getSupabase()
    .from('requests')
    .update({ status: '期限切れ' })
    .eq('status', '募集中')
    .lt('deadline', new Date().toISOString())
    .select()
  return data ?? []
}
