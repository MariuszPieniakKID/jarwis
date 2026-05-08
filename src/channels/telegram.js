import { chat } from '../assistant.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_CHAT = process.env.TELEGRAM_OWNER_CHAT_ID;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

let lastUpdateId = 0;

async function tgFetch(method, body = {}) {
  const r = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

export async function sendTelegram(chatId, text) {
  return tgFetch('sendMessage', {
    chat_id: chatId || OWNER_CHAT,
    text,
    parse_mode: 'Markdown'
  });
}

async function poll() {
  if (!BOT_TOKEN) return;

  try {
    const { result = [] } = await tgFetch('getUpdates', {
      offset: lastUpdateId + 1,
      timeout: 30,
      allowed_updates: ['message']
    });

    for (const update of result) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg?.text) continue;

      const chatId = String(msg.chat.id);
      if (OWNER_CHAT && chatId !== OWNER_CHAT) continue;

      console.log(`📨 Telegram [${chatId}]: ${msg.text}`);

      try {
        await tgFetch('sendChatAction', { chat_id: chatId, action: 'typing' });
        const reply = await chat('telegram', chatId, msg.text);
        await sendTelegram(chatId, reply);
      } catch (err) {
        console.error('Błąd Telegram:', err);
        await sendTelegram(chatId, '⚠️ Wystąpił błąd, spróbuj ponownie.');
      }
    }
  } catch (err) {
    console.error('Błąd pollingu Telegram:', err.message);
  }

  // Long-polling — wywołaj ponownie od razu
  setTimeout(poll, 100);
}

export function startTelegram() {
  if (!BOT_TOKEN) {
    console.log('ℹ️  Telegram wyłączony (brak TELEGRAM_BOT_TOKEN)');
    return;
  }
  console.log('✅ Telegram polling uruchomiony');
  poll();
}
