import { Router } from 'express';
import { google } from 'googleapis';
import { setConfig, getConfig } from '../db.js';
import { listCalendars, saveActiveCalendars } from '../calendar.js';

export const setupRouter = Router();

const oauth2Client = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
);

setupRouter.get('/', (req, res) => {
  const hasGoogle = !!getConfig('google_tokens');
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const hasWa     = !!process.env.WHATSAPP_OWNER_NUMBER;
  res.send(setupHtml({ hasGoogle, hasApiKey, hasWa, msg: req.query.msg }));
});

setupRouter.get('/google', (req, res) => {
  const url = oauth2Client().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar'
    ]
  });
  res.redirect(url);
});

setupRouter.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`<h2>Błąd: ${error}</h2><a href="/setup">Wróć</a>`);
  try {
    const client = oauth2Client();
    const { tokens } = await client.getToken(code);
    setConfig('google_tokens', JSON.stringify(tokens));
    res.redirect('/setup/calendars');
  } catch (err) {
    res.send(`<h2>Błąd autoryzacji: ${err.message}</h2><a href="/setup">Wróć</a>`);
  }
});

// Strona wyboru aktywnych kalendarzy
setupRouter.get('/calendars', async (req, res) => {
  if (!getConfig('google_tokens')) return res.redirect('/setup');

  try {
    const calendars = await listCalendars();
    const saved = getConfig('active_calendars');
    const active = saved ? JSON.parse(saved) : calendars.filter(c => c.accessRole === 'owner' || c.accessRole === 'writer').map(c => c.id);
    const defaultCal = getConfig('default_calendar') || 'primary';
    res.send(calendarsHtml(calendars, active, defaultCal));
  } catch (err) {
    res.send(`<h2>Błąd pobierania kalendarzy: ${err.message}</h2><a href="/setup">Wróć</a>`);
  }
});

// Zapis wybranych kalendarzy
setupRouter.post('/calendars', (req, res) => {
  const body = req.body;
  // active_calendars może być string (jeden) lub array (wiele) z formularza
  const active = Array.isArray(body.active) ? body.active : (body.active ? [body.active] : []);
  const defaultCal = body.default_calendar || 'primary';

  saveActiveCalendars(active);
  setConfig('default_calendar', defaultCal);

  res.redirect('/setup?msg=Kalendarze+zapisane+✅');
});

setupRouter.get('/status', (req, res) => {
  const saved = getConfig('active_calendars');
  const defaultCal = getConfig('default_calendar');
  res.json({
    google:             !!getConfig('google_tokens'),
    anthropic:          !!process.env.ANTHROPIC_API_KEY,
    whatsapp:           !!process.env.WHATSAPP_OWNER_NUMBER,
    telegram:           !!process.env.TELEGRAM_BOT_TOKEN,
    active_calendars:   saved ? JSON.parse(saved) : null,
    default_calendar:   defaultCal || 'primary'
  });
});

// ──────────────────────────── HTML ────────────────────────────

function setupHtml({ hasGoogle, hasApiKey, hasWa, msg }) {
  const check = (ok) => ok ? '✅' : '❌';
  const hasCals = !!getConfig('active_calendars');

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Jarwis — Konfiguracja</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f0f13; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    .container { max-width: 680px; margin: 0 auto; }
    h1 { font-size: 2rem; font-weight: 700; margin-bottom: 0.25rem; }
    .subtitle { color: #94a3b8; margin-bottom: 2rem; }
    .toast { background: #166534; color: #bbf7d0; padding: 0.75rem 1rem; border-radius: 8px;
             margin-bottom: 1.5rem; font-weight: 600; }
    .card { background: #1e1e2e; border: 1px solid #2d2d3d; border-radius: 12px;
            padding: 1.5rem; margin-bottom: 1rem; }
    .card h2 { font-size: 1.1rem; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; }
    .card p  { color: #94a3b8; font-size: 0.9rem; margin-bottom: 1rem; line-height: 1.5; }
    .btn { display: inline-block; padding: 0.6rem 1.4rem; border-radius: 8px; font-size: 0.95rem;
           font-weight: 600; text-decoration: none; cursor: pointer; border: none;
           background: #6366f1; color: #fff; transition: background .2s; }
    .btn:hover { background: #4f46e5; }
    .btn.muted { background: #1d4ed8; }
    .btn.muted:hover { background: #1e40af; }
    .btn.disabled { background: #374151; color: #6b7280; cursor: default; pointer-events: none; }
    .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.78rem;
             font-weight: 600; margin-left: auto; }
    .badge.ok  { background: #166534; color: #86efac; }
    .badge.nok { background: #7f1d1d; color: #fca5a5; }
    .code { background: #0f172a; border: 1px solid #1e293b; border-radius: 6px;
            padding: 0.75rem 1rem; font-family: monospace; font-size: 0.85rem;
            color: #a5b4fc; white-space: pre-wrap; }
    .row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.75rem; }
  </style>
</head>
<body>
<div class="container">
  <h1>🤖 Jarwis</h1>
  <p class="subtitle">Konfiguracja osobistego asystenta AI</p>

  ${msg ? `<div class="toast">✅ ${decodeURIComponent(msg)}</div>` : ''}

  <div class="card">
    <h2>1. Anthropic API Key
      <span class="badge ${hasApiKey ? 'ok' : 'nok'}">${check(hasApiKey)} ${hasApiKey ? 'OK' : 'Brak'}</span>
    </h2>
    <p>Klucz API do Claude — mózg asystenta.</p>
    <div class="code">ANTHROPIC_API_KEY=sk-ant-...</div>
  </div>

  <div class="card">
    <h2>2. Gmail + Google Calendar
      <span class="badge ${hasGoogle ? 'ok' : 'nok'}">${check(hasGoogle)} ${hasGoogle ? 'Połączony' : 'Brak'}</span>
    </h2>
    <p>OAuth 2.0 — dostęp do Twojego Gmail i wszystkich kalendarzy (w tym zsynchronizowanych z iPhone).</p>
    <div class="code">GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback</div>
    <div class="row">
      <a href="/setup/google" class="btn">${hasGoogle ? '🔄 Połącz ponownie' : '🔗 Połącz Google'}</a>
      ${hasGoogle ? `<a href="/setup/calendars" class="btn muted">📅 Wybierz kalendarze ${hasCals ? '✅' : '⚠️'}</a>` : ''}
    </div>
  </div>

  <div class="card">
    <h2>3. WhatsApp
      <span class="badge ${hasWa ? 'ok' : 'nok'}">${check(hasWa)} ${hasWa ? 'OK' : 'Brak'}</span>
    </h2>
    <p>Jarwis odpowie przez WhatsApp. Po starcie aplikacji zeskanuj QR w terminalu (WhatsApp → Urządzenia połączone → Dodaj urządzenie).</p>
    <div class="code">WHATSAPP_OWNER_NUMBER=48123456789</div>
  </div>

  <div class="card">
    <h2>4. Telegram <span class="badge nok">Opcjonalny</span></h2>
    <p>Alternatywny kanał — utwórz bota przez @BotFather.</p>
    <div class="code">TELEGRAM_BOT_TOKEN=...
TELEGRAM_OWNER_CHAT_ID=...</div>
  </div>

  <div class="card">
    <h2>5. Status</h2>
    <div class="row">
      <a href="/setup/status" class="btn" style="background:#0f766e">📊 JSON status</a>
      ${hasGoogle ? '<a href="/setup/calendars" class="btn" style="background:#7c3aed">📅 Kalendarze</a>' : ''}
    </div>
  </div>
</div>
</body>
</html>`;
}

function calendarsHtml(calendars, active, defaultCal) {
  const rows = calendars.map(c => {
    const isActive  = active.includes(c.id);
    const isDefault = c.id === defaultCal;
    const dot = c.color ? `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${c.color};margin-right:6px;vertical-align:middle"></span>` : '';
    const role = c.accessRole === 'owner' ? 'właściciel' : c.accessRole === 'writer' ? 'edytor' : 'tylko odczyt';
    const canWrite = c.accessRole === 'owner' || c.accessRole === 'writer';

    return `
    <tr>
      <td style="padding:0.75rem 0.5rem">
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
          <input type="checkbox" name="active" value="${escHtml(c.id)}" ${isActive ? 'checked' : ''}>
          ${dot}<strong>${escHtml(c.name)}</strong> ${c.primary ? '<span style="color:#94a3b8;font-size:0.8rem">(główny)</span>' : ''}
        </label>
      </td>
      <td style="padding:0.75rem 0.5rem;color:#94a3b8;font-size:0.85rem">${role}</td>
      <td style="padding:0.75rem 0.5rem;text-align:center">
        ${canWrite ? `<input type="radio" name="default_calendar" value="${escHtml(c.id)}" ${isDefault ? 'checked' : ''} title="Domyślny do tworzenia wydarzeń">` : '—'}
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Jarwis — Kalendarze</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f0f13; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    .container { max-width: 700px; margin: 0 auto; }
    h1 { font-size: 1.6rem; font-weight: 700; margin-bottom: 0.25rem; }
    .subtitle { color: #94a3b8; margin-bottom: 2rem; font-size: 0.9rem; }
    .card { background: #1e1e2e; border: 1px solid #2d2d3d; border-radius: 12px; padding: 1.5rem; }
    table { width: 100%; border-collapse: collapse; }
    thead th { text-align: left; color: #94a3b8; font-size: 0.8rem; padding: 0.5rem;
               border-bottom: 1px solid #2d2d3d; text-transform: uppercase; letter-spacing: .05em; }
    tbody tr:hover { background: #252535; }
    input[type=checkbox], input[type=radio] { width: 16px; height: 16px; cursor: pointer; accent-color: #6366f1; }
    .actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; align-items: center; }
    .btn { display: inline-block; padding: 0.6rem 1.4rem; border-radius: 8px; font-size: 0.95rem;
           font-weight: 600; text-decoration: none; cursor: pointer; border: none;
           background: #6366f1; color: #fff; }
    .btn:hover { background: #4f46e5; }
    .btn.secondary { background: #374151; }
    .hint { color: #94a3b8; font-size: 0.82rem; }
  </style>
</head>
<body>
<div class="container">
  <h1>📅 Kalendarze Google</h1>
  <p class="subtitle">Zaznacz które kalendarze Jarwis ma śledzić. Wybierz domyślny do tworzenia nowych wydarzeń.</p>

  <div class="card">
    <form method="POST" action="/setup/calendars">
      <table>
        <thead>
          <tr>
            <th>Kalendarz</th>
            <th>Dostęp</th>
            <th style="text-align:center" title="Domyślny do tworzenia wydarzeń">Domyślny ✏️</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="actions">
        <button type="submit" class="btn">💾 Zapisz</button>
        <a href="/setup" class="btn secondary">← Wróć</a>
        <span class="hint">Domyślny = tam trafiają nowe wydarzenia gdy nie powiesz w którym kalendarzu.</span>
      </div>
    </form>
  </div>
</div>
</body>
</html>`;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
