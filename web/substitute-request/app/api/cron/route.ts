import { NextRequest, NextResponse } from 'next/server'
import { checkExpiredRequests, getTeacher } from '@/lib/db'
import { sendEscalationEmail } from '@/lib/email'

// Vercel Cron: この endpoint を1時間ごとに呼ぶ
// vercel.json で { "crons": [{ "path": "/api/cron", "schedule": "0 * * * *" }] } を設定
export async function GET(request: NextRequest) {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const expired = await checkExpiredRequests()

  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail) {
    for (const req of expired) {
      const requester = await getTeacher(req.requester_id)
      if (requester) await sendEscalationEmail(adminEmail, requester, req)
    }
  }

  return NextResponse.json({ expired: expired.length })
}
