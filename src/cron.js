import cron from 'node-cron';
import { fireDueReminders } from './skills/reminders.js';
import { listEvents } from './calendar.js';
import { sendWhatsApp } from './channels/whatsapp.js';
import { sendTelegram } from './channels/telegram.js';
import { getConfig } from './db.js';

const TZ = process.env.TIMEZONE || 'Europe/Warsaw';

async function sendToOwner(text) {
  const wa = process.env.WHATSAPP_OWNER_NUMBER;
  const tg = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (wa) {
    try { await sendWhatsApp(wa, text); } catch {}
  }
  if (tg) {
    try { await sendTelegram(tg, text); } catch {}
  }
}

// Co minutę — sprawdź przypomnienia
cron.schedule('* * * * *', async () => {
  try { await fireDueReminders(); } catch (err) {
    console.error('Cron reminders:', err.message);
  }
}, { timezone: TZ });

// Każdego dnia o 7:30 — poranny briefing
cron.schedule('30 7 * * *', async () => {
  if (!getConfig('google_tokens')) return;

  try {
    const { events } = await listEvents(1);
    if (!events.length) {
      await sendToOwner('🌅 Dzień dobry! Dzisiaj nie masz żadnych zaplanowanych wydarzeń. Dobrego dnia!');
      return;
    }

    const lines = events.map(e => {
      const time = e.start.includes('T')
        ? new Date(e.start).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
        : 'cały dzień';
      return `• ${e.title} (${time}) [${e.calendar}]`;
    });

    await sendToOwner(`🌅 Dzień dobry! Twój plan na dziś:\n${lines.join('\n')}`);
  } catch (err) {
    console.error('Cron briefing:', err.message);
  }
}, { timezone: TZ });

// Każdy piątek o 17:00 — tygodniowe podsumowanie
cron.schedule('0 17 * * 5', async () => {
  if (!getConfig('google_tokens')) return;

  try {
    const { events } = await listEvents(7);
    if (!events.length) {
      await sendToOwner('📅 Przyszły tydzień wygląda na wolny — brak wydarzeń w kalendarzu.');
      return;
    }

    const lines = events.map(e => {
      const date = new Date(e.start).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'short', timeZone: TZ });
      const time = e.start.includes('T')
        ? new Date(e.start).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
        : 'cały dzień';
      return `• ${date} ${time}: ${e.title} [${e.calendar}]`;
    });

    await sendToOwner(`📅 Plan na następny tydzień:\n${lines.join('\n')}`);
  } catch (err) {
    console.error('Cron weekly:', err.message);
  }
}, { timezone: TZ });

console.log('✅ Cron jobs uruchomione (przypomnienia co minutę, briefing 7:30, weekly piątek 17:00)');
