import nodemailer, { type Transporter } from 'nodemailer';
import type { Sender } from '../db/schema';

export interface OutgoingEmail {
  emailId: string;
  campaignId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface DeliveryResult {
  messageId: string;
  previewUrl: string | null;
}

export interface EtherealAccount {
  user: string;
  pass: string;
  host: string;
  port: number;
  secure: boolean;
}

// one pooled transport per sender, rebuilt if the credentials change
const transports = new Map<string, { fingerprint: string; transporter: Transporter }>();

function transportFor(sender: Sender): Transporter {
  const fingerprint = [sender.smtpHost, sender.smtpPort, sender.smtpSecure, sender.smtpUser, sender.smtpPass].join('|');
  const cached = transports.get(sender.id);
  if (cached?.fingerprint === fingerprint) return cached.transporter;

  cached?.transporter.close();
  const transporter = nodemailer.createTransport({
    // single connection per mailbox so messages go out in order (parallel connections can finish
    // out of order). A throttled sender doesn't need more than one anyway.
    pool: true,
    maxConnections: 1,
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpSecure,
    auth: { user: sender.smtpUser, pass: sender.smtpPass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  transports.set(sender.id, { fingerprint, transporter });
  return transporter;
}

export async function deliverEmail(sender: Sender, email: OutgoingEmail): Promise<DeliveryResult> {
  const info = await transportFor(sender).sendMail({
    from: { name: sender.name, address: sender.email },
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    // fixed Message-ID per email, so if a duplicate ever got through the receiver can dedupe it
    messageId: `<${email.emailId}@reachinbox-scheduler.local>`,
    headers: {
      'X-ReachInbox-Email-Id': email.emailId,
      'X-ReachInbox-Campaign-Id': email.campaignId,
    },
  });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId, previewUrl: previewUrl || null };
}

// new Ethereal test account
export async function createEtherealAccount(): Promise<EtherealAccount> {
  const account = await nodemailer.createTestAccount();
  return {
    user: account.user,
    pass: account.pass,
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
  };
}

const TRANSIENT_ERROR_CODES = new Set([
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
]);

// retry on 4xx and network errors, not on 5xx or auth errors
export function isTransientSmtpError(err: unknown): boolean {
  const { code, responseCode } = (err ?? {}) as { code?: string; responseCode?: number };
  if (typeof responseCode === 'number') return responseCode >= 400 && responseCode < 500;
  if (code) return TRANSIENT_ERROR_CODES.has(code);
  return true;
}

export function closeTransports(): void {
  for (const { transporter } of transports.values()) transporter.close();
  transports.clear();
}
