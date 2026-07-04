import { Resend } from 'resend'
import type { Teacher, Request } from './types'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM ?? '自習監督システム <noreply@example.com>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function sendRequestEmail(
  to: Teacher,
  requester: Teacher,
  request: Request,
  token: string
) {
  const acceptUrl = `${APP_URL}/accept?token=${token}`
  const declineUrl = `${APP_URL}/decline?token=${token}`

  await resend.emails.send({
    from: FROM,
    to: to.email,
    subject: `【自習監督依頼】${request.target_date} ${request.period}時限（${requester.name}）`,
    text: [
      `${to.name} 先生`,
      '',
      `${requester.name} 先生より自習監督の依頼が届いています。`,
      `空きコマの先生へ一斉送信しており、先着1名の受諾で確定します。`,
      '',
      `【日時】${request.target_date}  ${request.period}時限`,
      `【理由】${request.reason}`,
      ...(request.note ? [`【備考】${request.note}`] : []),
      '',
      `▼ 受諾する（先着1名）`,
      acceptUrl,
      '',
      `▼ 辞退する`,
      declineUrl,
      '',
      `※ 受諾後のキャンセルは管理者にご連絡ください。`,
    ].join('\n'),
  })
}

export async function sendConfirmedEmail(
  acceptor: Teacher,
  requester: Teacher,
  request: Request
) {
  await Promise.all([
    resend.emails.send({
      from: FROM,
      to: acceptor.email,
      subject: `【確定】${request.target_date} ${request.period}時限 自習監督`,
      text: [
        `${acceptor.name} 先生`,
        '',
        `${request.target_date} ${request.period}時限の自習監督を受諾いただきありがとうございます。`,
        '',
        `【依頼者】${requester.name}`,
        `【理由】${request.reason}`,
        ...(request.note ? [`【備考】${request.note}`] : []),
        '',
        `よろしくお願いします。`,
      ].join('\n'),
    }),
    resend.emails.send({
      from: FROM,
      to: requester.email,
      subject: `【確定】${request.target_date} ${request.period}時限 代行者決定`,
      text: [
        `${requester.name} 先生`,
        '',
        `${request.target_date} ${request.period}時限の自習監督が確定しました。`,
        '',
        `【受諾者】${acceptor.name} 先生`,
        '',
        `ありがとうございます。`,
      ].join('\n'),
    }),
  ])
}

export async function sendEscalationEmail(
  adminEmail: string,
  requester: Teacher,
  request: Request
) {
  await resend.emails.send({
    from: FROM,
    to: adminEmail,
    subject: `【要対応】${request.target_date} ${request.period}時限 未確定`,
    text: [
      `以下の自習監督依頼が未確定のまま期限を過ぎました。`,
      `手動での対応をお願いします。`,
      '',
      `【依頼ID】${request.id}`,
      `【日時】${request.target_date}  ${request.period}時限`,
      `【申請者】${requester.name}`,
      `【理由】${request.reason}`,
    ].join('\n'),
  })
}
