import { NextRequest, NextResponse } from 'next/server'
import { getTeacher, getFreeTeachers, createRequest, createToken } from '@/lib/db'
import { sendRequestEmail } from '@/lib/email'

const DOW: Record<number, string> = { 0: '日', 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土' }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { teacherId, date, period, reason, note } = body

    if (!teacherId || !date || !period || !reason) {
      return NextResponse.json({ success: false, error: '必須項目が未入力です' }, { status: 400 })
    }

    const requester = await getTeacher(teacherId)
    if (!requester) {
      return NextResponse.json({ success: false, error: '教員が見つかりません' }, { status: 400 })
    }

    const [y, m, d] = date.split('-').map(Number)
    const dow = DOW[new Date(y, m - 1, d).getDay()]

    const freeTeachers = (await getFreeTeachers(dow, parseInt(period)))
      .filter(t => t.id !== teacherId)

    if (freeTeachers.length === 0) {
      return NextResponse.json({
        success: false,
        error: `${date} ${period}時限は代行可能な教員が見つかりませんでした`,
      }, { status: 400 })
    }

    const req = await createRequest(date, parseInt(period), teacherId, reason, note ?? '')

    await Promise.all(
      freeTeachers.map(async t => {
        const token = await createToken(req.id, t.id)
        await sendRequestEmail(t, requester, req, token)
      })
    )

    return NextResponse.json({
      success: true,
      message: `${freeTeachers.length}人の先生に依頼を送信しました（先着1名確定）`,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false, error: '依頼の送信に失敗しました' }, { status: 500 })
  }
}
