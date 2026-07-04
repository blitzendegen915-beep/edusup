import { getRecentRequests, getTeacherStats } from '@/lib/db'

export const dynamic = 'force-dynamic'

const STATUS_COLOR: Record<string, string> = {
  '募集中': 'text-orange-600 bg-orange-50',
  '確定':   'text-green-700 bg-green-50',
  '期限切れ': 'text-gray-400 bg-gray-50',
}

export default async function AdminPage() {
  const [requests, stats] = await Promise.all([
    getRecentRequests(50),
    getTeacherStats(),
  ])

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-700 mb-6">管理画面</h2>

      <section className="mb-10">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">依頼一覧（直近50件）</h3>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  {['ID', '対象日', '時限', '申請者', '理由', '状態', '受諾者'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{r.id}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.target_date}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.period}限</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.requester?.name ?? r.requester_id}</td>
                    <td className="px-4 py-3">{r.reason}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        STATUS_COLOR[r.status] ?? 'text-gray-600'
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.acceptor?.name ?? '—'}</td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">依頼はありません</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">教員別統計</h3>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                {['氏名', '依頼受信回数', '代行実施回数'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-gray-600">{s.sent_count}</td>
                  <td className="px-4 py-3 text-gray-600">{s.done_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
