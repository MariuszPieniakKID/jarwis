import { Router } from 'express';
import { google } from 'googleapis';
import { setConfig, getConfig } from '../db.js';

export const setupRouter = Router();

const oauth2Client = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
);

// Strona główna setup
setupRouter.get('/', (req, res) => {
  const hasGoogle  = !!getConfig('google_tokens');
  const hasApiKey  = !!process.env.ANTHROPIC_API_KEY;
  const hasWa      = !!process.env.WHATSAPP_OWNER_NUMBER;

  res.send(setupHtml({ hasGoogle, hasApiKey, hasWa }));
});

// Start OAuth Google
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

// Callback OAuth Google
setupRouter.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`<h2>Błąd: ${error}</h2><a href="/setup">Wróć</a>`);

  try {
    const client = oauth2Client();
    const { tokens } = await client.getToken(code);
    setConfig('google_tokens', JSON.stringify(tokens));
    res.redirect('/setup?google=ok');
  } catch (err) {
    res.send(`<h2>Błąd autoryzacji: ${err.message}</h2><a href="/setup">Wróć</a>`);
  }
});

// Status API
setupRouter.get('/status', (req, res) => {
  res.json({
    google:    !!getConfig('google_tokens'),
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    whatsapp:  !!process.env.WHATSAPP_OWNER_NUMBER,
    telegram:  !!process.env.TELEGRAM_BOT_TOKEN
  });
});

function setupHtml({ hasGoogle, hasApiKey, hasWa }) {
  const check = (ok) => ok ? '✅' : '❌';
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
    .card { background: #1e1e2e; border: 1px solid #2d2d3d; border-radius: 12px;
            padding: 1.5rem; margin-bottom: 1rem; }
    .card h2 { font-size: 1.1rem; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; }
    .card p  { color: #94a3b8; font-size: 0.9rem; margin-bottom: 1rem; line-height: 1.5; }
    .btn { display: inline-block; padding: 0.6rem 1.4rem; border-radius: 8px; font-size: 0.95rem;
           font-weight: 600; text-decoration: none; cursor: pointer; border: none;
           background: #6366f1; color: #fff; transition: background .2s; }
    .btn:hover { background: #4f46e5; }
    .btn.disabled { background: #374151; color: #6b7280; cursor: default; pointer-events: none; }
    .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.78rem;
             font-weight: 600; margin-left: auto; }
    .badge.ok  { background: #166534; color: #86efac; }
    .badge.nok { background: #7f1d1d; color: #fca5a5; }
    .code { background: #0f172a; border: 1px solid #1e293b; border-radius: 6px;
            padding: 0.75rem 1rem; font-family: monospace; font-size: 0.85rem;
            color: #a5b4fc; margin-top: 0.5rem; white-space: pre-wrap; }
    .step { color: #94a3b8; font-size: 0.85rem; margin-bottom: 0.5rem; }
  </style>
</head>
<body>
<div class="container">
  <h1>🤖 Jarwis</h1>
  <p class="subtitle">Konfiguracja osobistego asystenta AI</p>

  <!-- Anthropic -->
  <div class="card">
    <h2>1. Anthropic API Key
      <span class="badge ${hasApiKey ? 'ok' : 'nok'}">${check(hasApiKey)} ${hasApiKey ? 'Skonfigurowany' : 'Brak'}</span>
    </h2>
    <p>Klucz API do Claude — mózg asystenta. Dodaj go do zmiennych środowiskowych.</p>
    <div class="code">ANTHROPIC_API_KEY=sk-ant-...</div>
    ${hasApiKey ? '' : '<p style="margin-top:0.75rem;color:#fca5a5">⚠️ Ustaw ANTHROPIC_API_KEY w pliku .env lub zmiennych Railway i zrestartuj aplikację.</p>'}
  </div>

  <!-- Google -->
  <div class="card">
    <h2>2. Gmail + Google Calendar
      <span class="badge ${hasGoogle ? 'ok' : 'nok'}">${check(hasGoogle)} ${hasGoogle ? 'Połączony' : 'Brak'}</span>
    </h2>
    <p>Autoryzacja OAuth 2.0 dla dostępu do Twojego konta Google. Wymagane zmienne:</p>
    <div class="code">GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback</div>
    <br>
    <p class="step">Po ustawieniu zmiennych kliknij poniżej, żeby połączyć konto Google:</p>
    <a href="/setup/google" class="${hasApiKey ? 'btn' : 'btn disabled'}">
      ${hasGoogle ? '🔄 Połącz ponownie Google' : '🔗 Połącz Google'}
    </a>
  </div>

  <!-- WhatsApp -->
  <div class="card">
    <h2>3. WhatsApp
      <span class="badge ${hasWa ? 'ok' : 'nok'}">${check(hasWa)} ${hasWa ? 'Skonfigurowany' : 'Brak'}</span>
    </h2>
    <p>Jarwis komunikuje się z Tobą przez WhatsApp. Po uruchomieniu aplikacji zeskanuj QR kod w terminalu telefonem (WhatsApp → Urządzenia połączone → Dodaj urządzenie).</p>
    <div class="code">WHATSAPP_OWNER_NUMBER=48123456789  # Twój numer bez +</div>
  </div>

  <!-- Telegram -->
  <div class="card">
    <h2>4. Telegram <span class="badge nok">Opcjonalny</span></h2>
    <p>Alternatywny (lub dodatkowy) kanał komunikacji. Utwórz bota przez @BotFather i wpisz token poniżej:</p>
    <div class="code">TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_OWNER_CHAT_ID=123456789  # Twoje chat ID (wyślij /start do @userinfobot)</div>
  </div>

  <!-- Status -->
  <div class="card">
    <h2>5. Status systemu</h2>
    <p>Wszystkie usługi działają? Sprawdź API:</p>
    <div class="code">GET /setup/status</div>
    <br>
    <a href="/setup/status" class="btn" style="background:#0f766e">📊 Sprawdź status</a>
  </div>
</div>
</body>
</html>`;
}
