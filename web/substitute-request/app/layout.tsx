import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '自習監督依頼システム',
  description: '空きコマへの自習監督依頼を自動化します',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 min-h-screen">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-gray-800">自習監督依頼システム</h1>
              <p className="text-xs text-gray-400 mt-0.5">空きコマへ自動一斉通知 → 先着確定</p>
            </div>
            <a href="/admin" className="text-sm text-blue-600 hover:underline">管理画面</a>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
