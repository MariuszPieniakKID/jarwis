# 🤖 Jarwis — Personal AI Assistant

Osobisty asystent AI oparty na Claude, który zarządza Twoim kalendarzem, mailem i listą zakupów. Komunikuje się przez WhatsApp lub Telegram.

## Funkcje

- **WhatsApp / Telegram** — rozmawiasz z asystentem jak z człowiekiem
- **Google Calendar** — sprawdza plan, dodaje wydarzenia, szuka wolnych terminów
- **Gmail** — czyta maile, wysyła odpowiedzi na Twoje polecenie
- **Lista zakupów** — dodawanie, przeglądanie, odhaczanie
- **Przypomnienia** — "przypomnij mi o 15:00 o lekarzu"
- **Cron proaktywny** — poranny briefing 7:30, tygodniowe podsumowanie piątek 17:00

## Szybki start (lokalnie)

```bash
# 1. Sklonuj i zainstaluj
git clone https://github.com/twoj-nick/jarwis.git
cd jarwis
npm install

# 2. Skonfiguruj
cp .env.example .env
# Edytuj .env — dodaj ANTHROPIC_API_KEY

# 3. Uruchom
npm start

# 4. Otwórz kreator setup
open http://localhost:3000/setup
```

## Deploy na Railway

1. Fork tego repo na GitHub
2. Utwórz nowy projekt na [railway.app](https://railway.app)
3. Połącz z forkiem — Railway automatycznie wykryje `railway.json`
4. Dodaj zmienne środowiskowe w Railway → Variables:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://twoja-app.railway.app/auth/google/callback
   WHATSAPP_OWNER_NUMBER=48123456789
   ```
5. Deploy → otwórz `https://twoja-app.railway.app/setup`
6. Połącz Google i zeskanuj QR WhatsApp (widoczny w logach Railway)

## Zmienne środowiskowe

| Zmienna | Opis | Wymagana |
|---------|------|----------|
| `ANTHROPIC_API_KEY` | Klucz API Claude | ✅ |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | ✅ |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret | ✅ |
| `GOOGLE_REDIRECT_URI` | URL callbacku OAuth | ✅ |
| `WHATSAPP_OWNER_NUMBER` | Twój numer WhatsApp (bez +) | Zalecana |
| `TELEGRAM_BOT_TOKEN` | Token bota Telegram | Opcjonalna |
| `TELEGRAM_OWNER_CHAT_ID` | Twoje Telegram Chat ID | Opcjonalna |
| `OWNER_NAME` | Twoje imię (dla asystenta) | Opcjonalna |
| `ASSISTANT_NAME` | Nazwa asystenta | Opcjonalna |
| `TIMEZONE` | Strefa czasowa | Opcjonalna (domyślnie Europe/Warsaw) |

## Przykłady rozmowy

```
Ty: Co mam jutro w kalendarzu?
Jarwis: Jutro masz dwa spotkania: standup o 9:00 i lunch z Anią o 13:00.

Ty: Dodaj "wizyta u dentysty" na środę 15 maja o 14:00, niech trwa godzinę
Jarwis: ✅ Dodałem "wizyta u dentysty" — środa 15 maja, 14:00–15:00.

Ty: Dopisz do listy zakupów: mleko 2 litry, chleb, jajka 12 sztuk
Jarwis: ✅ Dodałem 3 produkty do listy zakupów.

Ty: Przypomnij mi jutro o 8:30 żeby wziąć dokumenty
Jarwis: ✅ Ustawię przypomnienie na jutro o 8:30.

Ty: Sprawdź czy mam maile od szefa
Jarwis: Masz 2 nieprzeczytane maile od jan.kowalski@firma.pl...
```

## Koszt

- **Railway Hobby**: ~$5/mies. (z $5 kredytu na start = pierwszy miesiąc gratis)
- **Anthropic Claude**: ~$0.50–$3/mies. przy typowym użyciu
- **Łącznie**: ~$5–$8/mies.

## Google OAuth — jak uzyskać dane

1. Wejdź na [console.cloud.google.com](https://console.cloud.google.com)
2. Utwórz nowy projekt
3. Włącz APIs: **Gmail API** i **Google Calendar API**
4. Utwórz dane logowania → OAuth 2.0 → Aplikacja internetowa
5. Dodaj URI przekierowania: `https://twoja-app.railway.app/auth/google/callback`
6. Skopiuj Client ID i Client Secret do zmiennych Railway
