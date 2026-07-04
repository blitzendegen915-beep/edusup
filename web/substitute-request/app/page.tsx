'use client'
import { useState, useEffect } from 'react'
import type { Teacher } from '@/lib/types'

export default function RequestPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    fetch('/api/teachers').then(r => r.json()).then(setTeachers)
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setResult(null)

    const form = e.currentTarget
    const get = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: get('teacherId'),
          date: get('date'),
          period: get('period'),
          reason: get('reason'),
          note: get('note'),
        }),
      })
      const json = await res.json()
      setResult({ success: json.success, message: json.success ? json.message : json.error })
      if (json.success) form.reset()
    } catch {
      setResult({ success: false, message: 'エラーが発生しました。再度お試しください' })
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-700 mb-6">自習監督 依頼フォーム</h2>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">申請者</label>
          <select
            name="teacherId"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— 選択してください —</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">対象日</label>
            <input
              type="date"
              name="date"
              required
              min={today}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">時限</label>
            <select
              name="period"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— 選択 —</option>
              {[1, 2, 3, 4, 5, 6].map(p => (
                <option key={p} value={p}>{p}時限</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">理由</label>
          <select
            name="reason"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— 選択してください —</option>
            <option>欠席</option>
            <option>遅刻</option>
            <option>早退</option>
            <option>その他</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            備考 <span className="text-gray-400 font-normal text-xs">（任意）</span>
          </label>
          <textarea
            name="note"
            rows={2}
            placeholder="引き継ぎ事項など"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
        >
          {loading ? '送信中...' : '依頼を送信する'}
        </button>
      </form>

      {result && (
        <div
          className={`mt-4 p-4 rounded-lg text-sm ${
            result.success
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {result.message}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4 text-center">
        空きコマの先生へ一斉送信されます。先着1名の受諾で確定します。
      </p>
    </div>
  )
}
