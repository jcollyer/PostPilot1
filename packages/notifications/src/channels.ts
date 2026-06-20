import {
  EMAIL_FROM,
  EXPO_ACCESS_TOKEN,
  RESEND_API_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
} from './config';

/**
 * Channel senders. Each returns a provider message id on success or throws.
 * All use native fetch — no provider SDKs.
 */

async function readError(res: Response, context: string): Promise<Error> {
  const text = await res.text().catch(() => '');
  return new Error(`${context}: HTTP ${res.status} ${text.slice(0, 300)}`);
}

/** Send an email via Resend (same provider as auth verification mail). */
export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<string> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      text: params.text,
    }),
  });
  if (!res.ok) throw await readError(res, 'resend');
  const json = (await res.json()) as { id?: string };
  return json.id ?? 'sent';
}

/** Send an Expo push to one or more device tokens; returns the first ticket id. */
export async function sendPush(params: {
  tokens: string[];
  title: string;
  body: string;
}): Promise<string> {
  if (params.tokens.length === 0) throw new Error('expo: no device tokens');
  const messages = params.tokens.map((to) => ({
    to,
    title: params.title,
    body: params.body,
    sound: 'default' as const,
  }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) throw await readError(res, 'expo');
  const json = (await res.json()) as { data?: Array<{ id?: string; status?: string }> };
  return json.data?.[0]?.id ?? 'sent';
}

/** Send an SMS via Twilio; returns the message SID. */
export async function sendSms(params: { to: string; body: string }): Promise<string> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams({
    To: params.to,
    From: TWILIO_FROM_NUMBER,
    Body: params.body,
  });
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) throw await readError(res, 'twilio');
  const json = (await res.json()) as { sid?: string };
  return json.sid ?? 'sent';
}
