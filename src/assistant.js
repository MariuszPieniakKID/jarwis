import OpenAI from 'openai';
import { getHistory, saveMessage } from './db.js';
import { listEvents, createEvent, listCalendars } from './calendar.js';
import { listEmails, sendEmail } from './gmail.js';
import { getShoppingList, addToList, removeItem } from './skills/shopping.js';
import { addReminder } from './skills/reminders.js';

// Lazy init — nie crashuje przy starcie gdy brak klucza
let _client = null;
function getClient() {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error('Brak PERPLEXITY_API_KEY — dodaj zmienną w Railway Variables');
  }
  if (!_client) {
    _client = new OpenAI({
      apiKey:  process.env.PERPLEXITY_API_KEY,
      baseURL: 'https://api.perplexity.ai'
    });
  }
  return _client;
}

const MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6';

function buildSystemPrompt() {
  return `Jesteś ${process.env.ASSISTANT_NAME || 'Jarwis'}, osobistym asystentem AI dla ${process.env.OWNER_NAME || 'właściciela'}.
Mówisz po polsku, jesteś pomocny, konkretny i zwięzły (wiadomości na WhatsApp — max 3-4 zdania, chyba że poproszony o więcej).
Masz dostęp do kalendarzy Google (wszystkich zsynchronizowanych z iPhone), maila Gmail, listy zakupów i przypomnień.
Dzisiejsza data: ${new Date().toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: process.env.TIMEZONE || 'Europe/Warsaw' })}.

Zasady kalendarza:
- Zawsze pobieraj wszystkie kalendarze razem — użytkownik ma wiele kalendarzy na iPhone.
- Przy wyświetlaniu wydarzeń zawsze podawaj nazwę kalendarza w nawiasie, np. "Dentysta o 14:00 (Prywatny)".
- Przy tworzeniu wydarzenia zapytaj w którym kalendarzu dodać, jeśli nie jest jasne z kontekstu.
- Gdy ktoś pyta o "wolny czas" — sprawdź wszystkie kalendarze.

Gdy pytają co masz w kalendarzu — sprawdź narzędziem. Gdy chcą dodać wydarzenie — użyj narzędzia. Podobnie z mailem i listą zakupów.`;
}

// Narzędzia w formacie OpenAI function calling
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'calendar_list_events',
      description: 'Pobiera nadchodzące wydarzenia ze wszystkich kalendarzy Google (w tym zsynchronizowanych z iPhone). Używaj gdy ktoś pyta o plan, wolny termin, spotkania.',
      parameters: {
        type: 'object',
        properties: {
          days:          { type: 'number',  description: 'Ile dni do przodu sprawdzić (domyślnie 7)' },
          calendar_name: { type: 'string',  description: 'Opcjonalnie: nazwa konkretnego kalendarza, np. "Praca"' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calendar_list_calendars',
      description: 'Wyświetla listę wszystkich dostępnych kalendarzy Google użytkownika (zsynchronizowanych z iPhone).',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calendar_create',
      description: 'Tworzy nowe wydarzenie w wybranym kalendarzu Google (pojawi się też na iPhone).',
      parameters: {
        type: 'object',
        properties: {
          title:         { type: 'string', description: 'Tytuł wydarzenia' },
          start:         { type: 'string', description: 'Data i czas startu ISO 8601, np. 2025-06-15T14:00:00. Dla całodniowych: 2025-06-15' },
          end:           { type: 'string', description: 'Data i czas końca ISO 8601. Dla całodniowych: 2025-06-16' },
          description:   { type: 'string', description: 'Opis (opcjonalnie)' },
          location:      { type: 'string', description: 'Miejsce (opcjonalnie)' },
          calendar_name: { type: 'string', description: 'Nazwa kalendarza, np. "Praca", "Rodzina". Domyślnie primary.' }
        },
        required: ['title', 'start', 'end']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'email_list',
      description: 'Pobiera maile z Gmaila.',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Ile maili pobrać (domyślnie 5)' },
          query: { type: 'string', description: 'Filtr Gmail, np. "is:unread", "from:boss@firma.pl"' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'email_send',
      description: 'Wysyła email przez Gmail.',
      parameters: {
        type: 'object',
        properties: {
          to:      { type: 'string', description: 'Adres odbiorcy' },
          subject: { type: 'string', description: 'Temat' },
          body:    { type: 'string', description: 'Treść maila' }
        },
        required: ['to', 'subject', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'shopping_list_get',
      description: 'Pobiera aktualną listę zakupów.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'shopping_list_add',
      description: 'Dodaje produkty do listy zakupów.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                item: { type: 'string' },
                qty:  { type: 'string', description: 'Ilość, np. "2 kg"' }
              },
              required: ['item']
            }
          }
        },
        required: ['items']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'shopping_list_done',
      description: 'Oznacza produkt jako kupiony.',
      parameters: {
        type: 'object',
        properties: {
          item_id: { type: 'number', description: 'ID produktu z listy' }
        },
        required: ['item_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_reminder',
      description: 'Ustawia przypomnienie — Jarwis wyśle wiadomość o podanej godzinie.',
      parameters: {
        type: 'object',
        properties: {
          message:  { type: 'string', description: 'Treść przypomnienia' },
          datetime: { type: 'string', description: 'Kiedy przypomnieć — ISO 8601, np. 2025-06-15T09:00:00' }
        },
        required: ['message', 'datetime']
      }
    }
  }
];

async function runTool(name, args) {
  switch (name) {
    case 'calendar_list_events':    return listEvents(args.days || 7, args.calendar_name);
    case 'calendar_list_calendars': return listCalendars();
    case 'calendar_create':         return createEvent(args);
    case 'email_list':              return listEmails(args.count || 5, args.query || 'is:unread');
    case 'email_send':              return sendEmail(args.to, args.subject, args.body);
    case 'shopping_list_get':       return getShoppingList();
    case 'shopping_list_add':       return addToList(args.items);
    case 'shopping_list_done':      return removeItem(args.item_id);
    case 'add_reminder':            return addReminder(args.message, args.datetime);
    default: return { error: `Nieznane narzędzie: ${name}` };
  }
}

export async function chat(channel, sender, userMessage) {
  const history = getHistory(channel, sender, 20);
  saveMessage(channel, sender, 'user', userMessage);

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...history,
    { role: 'user', content: userMessage }
  ];

  let response = await getClient().chat.completions.create({
    model:    MODEL,
    messages,
    tools:    TOOLS,
    tool_choice: 'auto',
    max_tokens: 1024
  });

  // Agentic loop — obsługa tool_calls (format OpenAI)
  while (response.choices[0].finish_reason === 'tool_calls') {
    const assistantMsg = response.choices[0].message;
    messages.push(assistantMsg);

    for (const toolCall of assistantMsg.tool_calls) {
      let result;
      try {
        const args = JSON.parse(toolCall.function.arguments);
        result = await runTool(toolCall.function.name, args);
      } catch (err) {
        result = { error: String(err.message) };
      }

      messages.push({
        role:         'tool',
        tool_call_id: toolCall.id,
        content:      JSON.stringify(result)
      });
    }

    response = await getClient().chat.completions.create({
      model:    MODEL,
      messages,
      tools:    TOOLS,
      tool_choice: 'auto',
      max_tokens: 1024
    });
  }

  const text = response.choices[0].message.content?.trim() || '';
  saveMessage(channel, sender, 'assistant', text);
  return text;
}
