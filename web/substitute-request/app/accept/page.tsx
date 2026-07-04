'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Request } from '@/lib/types'

function AcceptContent() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<{ success: boolean; message: string; request?: Request } | null>(null)

  async function handleAccept() {
    setLoading(true)
    try {
      const res = await fetch('/api/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await res.json()
      setDone({
        success: json.success,
        message: json.success
          ? `${json.request.target_date} ${json.request.period}時限の自習監督を受諾しました。確認メールをお送りします。`
          : (json.error ?? 'エラーが発生しました'),
        request: json.request,
      })
    } catch {
      setDone({ success: false, message: 'エラーが発生しました' })
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return <p className="text-red-600">トークンが見つかりません</p>
  }

  if (done) {
    return (
      <div
        className={`p-6 rounded-xl border ${
          done.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}
      >
        <p className={`font-medium ${
          done.success ? 'text-green-800' : 'text-red-800'
        }`}>
          {done.message}
        </p>
        <a href="/" className="mt-4 block text-sm text-blue-600 hover:underline">トップへ戻る</a>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">自習監督を引き受けますか？</h2>
      <p className="text-sm text-gray-500 mb-6">確定後のキャンセルは管理者にご連絡ください。</p>
      <div className="flex gap-3">
        <button
          onClick={handleAccept}
          disabled={loading}
          className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
        >
          {loading ? '処理中...' : '受諾する'}
        </button>
        <a
          href={`/decline?token=${token}`}
          className="flex-1 text-center border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          辞退する
        </a>
      </div>
    </div>
  )
}

export default function AcceptPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-700 mb-6">受諾確認</h2>
      <Suspense fallback={<p className="text-gray-400">読み込み中...</p>}>
        <AcceptContent />
      </Suspense>
    </div>
  )
}
