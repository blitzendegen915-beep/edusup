import { NextResponse } from 'next/server'
import { getTeachers } from '@/lib/db'

export async function GET() {
  try {
    const teachers = await getTeachers()
    return NextResponse.json(teachers)
  } catch {
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 })
  }
}
