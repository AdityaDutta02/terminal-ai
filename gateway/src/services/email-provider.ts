import { Resend } from 'resend'

export interface EmailSendParams {
  from: string
  to: string
  subject: string
  html: string
}

export interface EmailSendResult {
  messageId: string
}

export interface EmailProvider {
  send(params: EmailSendParams): Promise<EmailSendResult>
}

export class ResendEmailProvider implements EmailProvider {
  private resend: Resend

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey)
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const { data, error } = await this.resend.emails.send({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })

    if (error) {
      throw new Error(`Email delivery failed: ${error.message}`)
    }

    return { messageId: data?.id ?? 'unknown' }
  }
}
