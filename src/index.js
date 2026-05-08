import 'dotenv/config';
import express from 'express';
import { startWhatsApp } from './channels/whatsapp.js';
import { startTelegram } from './channels/telegram.js';
import { setupRouter } from './setup/router.js';
import './cron.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check dla Railway
app.get('/health', (req, res) => res.json({ status: 'ok', name: 'Jarwis', ts: Date.now() }));

// Setup wizard
app.use('/setup', setupRouter);
// OAuth callback (musi być na root poziomie, nie w /setup)
app.use('/auth', setupRouter);

// Redirect root → setup
app.get('/', (req, res) => res.redirect('/setup'));

app.listen(PORT, () => {
  console.log(`\n🤖 Jarwis uruchomiony na porcie ${PORT}`);
  console.log(`📋 Kreator setup: http://localhost:${PORT}/setup\n`);
});

// Uruchom kanały komunikacji
startTelegram();

// WhatsApp — uruchom tylko jeśli podany numer właściciela
if (process.env.WHATSAPP_OWNER_NUMBER) {
  startWhatsApp().catch(err => {
    console.error('WhatsApp error:', err.message);
  });
} else {
  console.log('ℹ️  WhatsApp wyłączony (brak WHATSAPP_OWNER_NUMBER)');
}
