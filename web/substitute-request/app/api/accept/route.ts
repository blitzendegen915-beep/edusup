import { NextRequest, NextResponse } from 'next/server'
import { acceptRequest, getTeacher } from '@/lib/db'
import { sendConfirmedEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()
    if (!token) {
      return NextResponse.json({ success: false, error: 'トークンがありません' }, { status: 400 })
    }

    const result = await acceptRequest(token)
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    if (result.request?.acceptor_id) {
      const [acceptor, requester] = await Promise.all([
        getTeacher(result.request.acceptor_id),
        getTeacher(result.request.requester_id),
      ])
      if (acceptor && requester) {
        await sendConfirmedEmail(acceptor, requester, result.request)
      }
    }

    return NextResponse.json({ success: true, request: result.request })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false, error: '処理に失敗しました' }, { status: 500 })
  }
}
