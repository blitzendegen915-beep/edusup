export type Status = '募集中' | '確定' | '期限切れ'

export interface Teacher {
  id: string
  name: string
  email: string
  subject: string
}

export interface Request {
  id: string
  created_at: string
  target_date: string
  period: number
  requester_id: string
  reason: string
  note: string
  status: Status
  acceptor_id: string | null
  accepted_at: string | null
  deadline: string
}

export interface Token {
  id: string
  request_id: string
  teacher_id: string
  used: boolean
}

export interface TeacherStats {
  id: string
  name: string
  sent_count: number
  done_count: number
}
