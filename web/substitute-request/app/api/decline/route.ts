import { NextRequest, NextResponse } from 'next/server'
import { declineToken } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()
    if (!token) {
      return NextResponse.json({ success: false, error: 'トークンがありません' }, { status: 400 })
    }

    const result = await declineToken(token)
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false, error: '処理に失敗しました' }, { status: 500 })
  }
}
