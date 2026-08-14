import nodemailer, { Transporter } from 'nodemailer';
import config from '../config';

let transport: Transporter | null = null;

/**
 * Initializes and returns a Nodemailer transport configured with Ethereal SMTP credentials.
 * Uses lazy initialization — creates the transport on first call and reuses it thereafter.
 */
export function initializeTransport(): Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });
  }
  return transport;
}

/**
 * Sends an email using the singleton Nodemailer transport.
 * Returns the message ID and an Ethereal preview URL.
 */
export async function sendEmail(
  from: string,
  to: string,
  subject: string,
  body: string
): Promise<{ messageId: string; previewUrl: string }> {
  const transporter = initializeTransport();

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html: body,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || '';

  return {
    messageId: info.messageId,
    previewUrl,
  };
}

/**
 * Categorizes an SMTP error as 'transient' or 'permanent'.
 *
 * Transient errors (retriable): ECONNREFUSED, ECONNRESET, ETIMEDOUT, ESOCKET, 4xx response codes
 * Permanent errors (no retry): Invalid recipient (550, 553), auth failure (535), 5xx response codes
 */
export function categorizeError(error: unknown): 'transient' | 'permanent' {
  if (!error || typeof error !== 'object') {
    return 'transient';
  }

  const err = error as Record<string, unknown>;

  // Check error code for network-level issues
  const code = err.code as string | undefined;
  if (code) {
    const transientCodes = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKET'];
    if (transientCodes.includes(code)) {
      return 'transient';
    }
  }

  // Check SMTP response code
  const responseCode = (err.responseCode as number) ?? (err.code as number);

  if (typeof responseCode === 'number') {
    // 4xx codes are transient
    if (responseCode >= 400 && responseCode < 500) {
      return 'transient';
    }

    // Specific permanent codes
    const permanentCodes = [535, 550, 553];
    if (permanentCodes.includes(responseCode)) {
      return 'permanent';
    }

    // All other 5xx codes are permanent
    if (responseCode >= 500 && responseCode < 600) {
      return 'permanent';
    }
  }

  // Check for known permanent error messages
  const message = ((err.message as string) || '').toLowerCase();
  const response = ((err.response as string) || '').toLowerCase();
  const combined = `${message} ${response}`;

  if (
    combined.includes('invalid recipient') ||
    combined.includes('authentication') ||
    combined.includes('auth failed') ||
    combined.includes('invalid login') ||
    combined.includes('user not found') ||
    combined.includes('mailbox not found') ||
    combined.includes('recipient rejected')
  ) {
    return 'permanent';
  }

  if (
    combined.includes('timeout') ||
    combined.includes('connection refused') ||
    combined.includes('connection reset') ||
    combined.includes('temporarily')
  ) {
    return 'transient';
  }

  // Default to transient for unknown errors (allow retries)
  return 'transient';
}
