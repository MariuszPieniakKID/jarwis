import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chat } from '../assistant.js';
import pino from 'pino';

const __dir = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = join(__dir, '..', '..', 'data', 'whatsapp_auth');

if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

const OWNER = process.env.WHATSAPP_OWNER_NUMBER
  ? `${process.env.WHATSAPP_OWNER_NUMBER}@s.whatsapp.net`
  : null;

let sock = null;

export async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Jarwis', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Zeskanuj QR kodem WhatsApp (Urządzenia połączone → Dodaj urządzenie):\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`WhatsApp rozłączony (kod ${code}), ponawiam: ${shouldReconnect}`);
      if (shouldReconnect) setTimeout(startWhatsApp, 5000);
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp połączony');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      // Tylko od właściciela (jeśli skonfigurowany)
      if (OWNER && from !== OWNER) {
        console.log(`Ignoruję wiadomość od ${from} (nie właściciel)`);
        continue;
      }

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';

      if (!text) continue;

      console.log(`📨 WhatsApp [${from}]: ${text}`);

      try {
        await sock.sendPresenceUpdate('composing', from);
        const reply = await chat('whatsapp', from, text);
        await sock.sendMessage(from, { text: reply });
        await sock.sendPresenceUpdate('paused', from);
      } catch (err) {
        console.error('Błąd odpowiedzi WhatsApp:', err);
        await sock.sendMessage(from, { text: '⚠️ Wystąpił błąd, spróbuj ponownie.' });
      }
    }
  });

  return sock;
}

export async function sendWhatsApp(to, text) {
  if (!sock) throw new Error('WhatsApp nie jest połączony');
  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text });
}
