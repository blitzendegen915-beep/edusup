'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function DeclineContent() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<{ success: boolean; message: string } | null>(null)

  async function handleDecline() {
    setLoading(true)
    try {
      const res = await fetch('/api/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await res.json()
      setDone({
        success: json.success,
        message: json.success
          ? '辞退を受け付けました。ご回答ありがとうございます。'
          : (json.error ?? 'エラーが発生しました'),
      })
    } catch {
      setDone({ success: false, message: 'エラーが発生しました' })
    } finally {
      setLoading(false)
    }
  }

  if (!token) return <p className="text-red-600">トークンが見つかりません</p>

  if (done) {
    return (
      <div className={`p-6 rounded-xl border ${
        done.success ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'
      }`}>
        <p className={`font-medium ${
          done.success ? 'text-gray-700' : 'text-red-800'
        }`}>{done.message}</p>
        <a href="/" className="mt-4 block text-sm text-blue-600 hover:underline">トップへ戻る</a>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">辞退しますか？</h2>
      <p className="text-sm text-gray-500 mb-6">
        辞退すると他の先生へ依頼が残ります。
      </p>
      <div className="flex gap-3">
        <a
          href={`/accept?token=${token}`}
          className="flex-1 text-center bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          やはり受諾する
        </a>
        <button
          onClick={handleDecline}
          disabled={loading}
          className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {loading ? '処理中...' : '辞退する'}
        </button>
      </div>
    </div>
  )
}

export default function DeclinePage() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-700 mb-6">辞退確認</h2>
      <Suspense fallback={<p className="text-gray-400">読み込み中...</p>}>
        <DeclineContent />
      </Suspense>
    </div>
  )
}
