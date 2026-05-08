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

const TZ = process.env.TIMEZONE || 'Europe/Warsaw';

export async function listEvents(days = 7) {
  const calendar = google.calendar({ version: 'v3', auth: getAuth() });

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 20
  });

  const events = (res.data.items || []).map(e => ({
    id:       e.id,
    title:    e.summary || '(bez tytułu)',
    start:    e.start.dateTime || e.start.date,
    end:      e.end.dateTime || e.end.date,
    location: e.location,
    desc:     e.description?.substring(0, 200)
  }));

  return { events, count: events.length };
}

export async function createEvent({ title, start, end, description, location }) {
  const calendar = google.calendar({ version: 'v3', auth: getAuth() });

  const event = {
    summary:     title,
    description,
    location,
    start: { dateTime: start, timeZone: TZ },
    end:   { dateTime: end,   timeZone: TZ }
  };

  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event
  });

  return {
    success:  true,
    id:       res.data.id,
    htmlLink: res.data.htmlLink,
    title,
    start,
    end
  };
}
