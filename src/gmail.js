import { google } from 'googleapis';
import { getConfig } from './db.js';

function getAuth() {
  const tokens = getConfig('google_tokens');
  if (!tokens) throw new Error('Google nie jest autoryzowany — uruchom /setup');

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials(JSON.parse(tokens));
  return auth;
}

function decodeBase64(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function getBody(payload) {
  if (payload.body?.data) return decodeBase64(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = getBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

export async function listEmails(count = 5, query = 'is:unread') {
  const gmail = google.gmail({ version: 'v1', auth: getAuth() });

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: count
  });

  if (!list.data.messages?.length) return { emails: [] };

  const emails = await Promise.all(
    list.data.messages.map(async ({ id }) => {
      const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      const headers = msg.data.payload.headers;
      const get = (name) => headers.find(h => h.name === name)?.value || '';
      const body = getBody(msg.data.payload).substring(0, 500);

      return {
        id,
        from:    get('From'),
        subject: get('Subject'),
        date:    get('Date'),
        snippet: msg.data.snippet,
        body
      };
    })
  );

  return { emails };
}

export async function sendEmail(to, subject, body) {
  const gmail = google.gmail({ version: 'v1', auth: getAuth() });

  const profile = await gmail.users.getProfile({ userId: 'me' });
  const from = profile.data.emailAddress;

  const raw = Buffer.from(
    `From: ${from}\r\nTo: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`
  ).toString('base64url');

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  return { success: true, from, to, subject };
}
