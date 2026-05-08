import { db } from '../db.js';
import { sendWhatsApp } from '../channels/whatsapp.js';
import { sendTelegram } from '../channels/telegram.js';

export function addReminder(message, datetime, channel = 'whatsapp') {
  const fireAt = Math.floor(new Date(datetime).getTime() / 1000);
  if (isNaN(fireAt)) throw new Error('Nieprawidłowa data: ' + datetime);

  const res = db.prepare(
    'INSERT INTO reminders(message, fire_at, channel) VALUES(?,?,?)'
  ).run(message, fireAt, channel);

  return {
    success: true,
    id:      res.lastInsertRowid,
    message,
    fire_at: new Date(fireAt * 1000).toLocaleString('pl-PL', { timeZone: process.env.TIMEZONE || 'Europe/Warsaw' })
  };
}

export async function fireDueReminders() {
  const now = Math.floor(Date.now() / 1000);
  const due = db.prepare(
    'SELECT * FROM reminders WHERE fire_at <= ? AND sent = 0'
  ).all(now);

  for (const r of due) {
    try {
      const text = `⏰ Przypomnienie: ${r.message}`;
      if (r.channel === 'telegram') {
        await sendTelegram(null, text);
      } else {
        const owner = process.env.WHATSAPP_OWNER_NUMBER;
        if (owner) await sendWhatsApp(owner, text);
      }
      db.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').run(r.id);
      console.log(`Wysłano przypomnienie #${r.id}: ${r.message}`);
    } catch (err) {
      console.error(`Błąd przypomnienia #${r.id}:`, err.message);
    }
  }
}
