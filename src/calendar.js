import { google } from 'googleapis';
import { getConfig, setConfig } from './db.js';

const TZ = process.env.TIMEZONE || 'Europe/Warsaw';

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

// Pobiera listę wszystkich kalendarzy konta Google
export async function listCalendars() {
  const cal = google.calendar({ version: 'v3', auth: getAuth() });
  const res = await cal.calendarList.list({ showDeleted: false });

  return (res.data.items || []).map(c => ({
    id:          c.id,
    name:        c.summary,
    description: c.description,
    color:       c.backgroundColor,
    primary:     !!c.primary,
    selected:    !!c.selected,
    accessRole:  c.accessRole   // owner | writer | reader
  }));
}

// Zwraca ID kalendarzy wybranych przez użytkownika (lub wszystkich dostępnych)
async function getActiveCalendarIds() {
  const saved = getConfig('active_calendars');
  if (saved) return JSON.parse(saved);

  // Brak konfiguracji — użyj wszystkich kalendarzy z rolą writer/owner
  const all = await listCalendars();
  return all
    .filter(c => c.accessRole === 'owner' || c.accessRole === 'writer')
    .map(c => c.id);
}

// Zapisz wybrane kalendarze
export function saveActiveCalendars(ids) {
  setConfig('active_calendars', JSON.stringify(ids));
}

// ID kalendarza do tworzenia (domyślnie primary lub pierwszy z active)
async function getDefaultWriteCalendarId() {
  const saved = getConfig('default_calendar');
  if (saved) return saved;
  return 'primary';
}

export async function listEvents(days = 7, calendarName = null) {
  const cal = google.calendar({ version: 'v3', auth: getAuth() });

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);

  let calendarIds;

  if (calendarName) {
    // Szukaj kalendarza po nazwie
    const all = await listCalendars();
    const match = all.find(c =>
      c.name.toLowerCase().includes(calendarName.toLowerCase())
    );
    calendarIds = match ? [match.id] : await getActiveCalendarIds();
  } else {
    calendarIds = await getActiveCalendarIds();
  }

  // Pobierz zdarzenia ze wszystkich kalendarzy równolegle
  const results = await Promise.allSettled(
    calendarIds.map(id =>
      cal.events.list({
        calendarId: id,
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50
      }).then(res => ({ calId: id, items: res.data.items || [] }))
    )
  );

  // Zbierz wszystkie zdarzenia, dodaj nazwę kalendarza
  const allCalendars = await listCalendars();
  const calMap = Object.fromEntries(allCalendars.map(c => [c.id, c.name]));

  const events = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value.items.map(e => ({
      id:           e.id,
      calendar:     calMap[r.value.calId] || r.value.calId,
      calendar_id:  r.value.calId,
      title:        e.summary || '(bez tytułu)',
      start:        e.start.dateTime || e.start.date,
      end:          e.end.dateTime || e.end.date,
      allDay:       !e.start.dateTime,
      location:     e.location,
      desc:         e.description?.substring(0, 300)
    })));

  // Posortuj po czasie startu
  events.sort((a, b) => new Date(a.start) - new Date(b.start));

  return { events, count: events.length, calendars_checked: calendarIds.length };
}

export async function createEvent({ title, start, end, description, location, calendar_name }) {
  const cal = google.calendar({ version: 'v3', auth: getAuth() });

  let calendarId = await getDefaultWriteCalendarId();

  // Jeśli podano nazwę kalendarza — znajdź go
  if (calendar_name) {
    const all = await listCalendars();
    const match = all.find(c =>
      c.name.toLowerCase().includes(calendar_name.toLowerCase()) &&
      (c.accessRole === 'owner' || c.accessRole === 'writer')
    );
    if (match) calendarId = match.id;
  }

  const isAllDay = !start.includes('T');

  const event = {
    summary:     title,
    description,
    location,
    start: isAllDay
      ? { date: start.split('T')[0] }
      : { dateTime: start, timeZone: TZ },
    end: isAllDay
      ? { date: end.split('T')[0] }
      : { dateTime: end, timeZone: TZ }
  };

  const res = await cal.events.insert({
    calendarId,
    requestBody: event
  });

  const allCalendars = await listCalendars();
  const calName = allCalendars.find(c => c.id === calendarId)?.name || calendarId;

  return {
    success:   true,
    id:        res.data.id,
    htmlLink:  res.data.htmlLink,
    title,
    start,
    end,
    calendar:  calName
  };
}
