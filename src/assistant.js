import Anthropic from '@anthropic-ai/sdk';
import { getHistory, saveMessage } from './db.js';
import { listEvents, createEvent } from './calendar.js';
import { listEmails, sendEmail } from './gmail.js';
import { getShoppingList, addToList, clearList, removeItem } from './skills/shopping.js';
import { addReminder } from './skills/reminders.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Jesteś ${process.env.ASSISTANT_NAME || 'Jarwis'}, osobistym asystentem AI dla ${process.env.OWNER_NAME || 'właściciela'}.
Mówisz po polsku, jesteś pomocny, konkretny i zwięzły (wiadomości na WhatsApp — max 3-4 zdania, chyba że poproszony o więcej).
Masz dostęp do narzędzi: kalendarza, maila, listy zakupów i przypomnień.
Dzisiejsza data: ${new Date().toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: process.env.TIMEZONE || 'Europe/Warsaw' })}.
Gdy pytają co masz w kalendarzu — sprawdź narzędziem. Gdy chcą dodać wydarzenie — użyj narzędzia. Podobnie z mailem i listą zakupów.`;

const TOOLS = [
  {
    name: 'calendar_list',
    description: 'Pobiera nadchodzące wydarzenia z kalendarza Google. Używaj gdy ktoś pyta o plan, wolny termin, spotkania.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Ile dni do przodu sprawdzić (domyślnie 7)' }
      }
    }
  },
  {
    name: 'calendar_create',
    description: 'Tworzy nowe wydarzenie w kalendarzu Google.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Tytuł wydarzenia' },
        start:       { type: 'string', description: 'Data i czas startu ISO 8601, np. 2025-06-15T14:00:00' },
        end:         { type: 'string', description: 'Data i czas końca ISO 8601' },
        description: { type: 'string', description: 'Opis (opcjonalnie)' },
        location:    { type: 'string', description: 'Miejsce (opcjonalnie)' }
      },
      required: ['title', 'start', 'end']
    }
  },
  {
    name: 'email_list',
    description: 'Pobiera ostatnie nieodczytane maile z Gmaila.',
    input_schema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Ile maili pobrać (domyślnie 5)' },
        query: { type: 'string', description: 'Filtr Gmail (np. "from:boss@firma.pl")' }
      }
    }
  },
  {
    name: 'email_send',
    description: 'Wysyła email przez Gmail.',
    input_schema: {
      type: 'object',
      properties: {
        to:      { type: 'string', description: 'Adres odbiorcy' },
        subject: { type: 'string', description: 'Temat' },
        body:    { type: 'string', description: 'Treść maila' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'shopping_list_get',
    description: 'Pobiera aktualną listę zakupów.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'shopping_list_add',
    description: 'Dodaje produkty do listy zakupów.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item: { type: 'string' },
              qty:  { type: 'string', description: 'Ilość, np. "2 kg", "1 opakowanie"' }
            },
            required: ['item']
          },
          description: 'Lista produktów do dodania'
        }
      },
      required: ['items']
    }
  },
  {
    name: 'shopping_list_done',
    description: 'Oznacza produkt jako kupiony lub usuwa go z listy.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'number', description: 'ID produktu z listy' }
      },
      required: ['item_id']
    }
  },
  {
    name: 'add_reminder',
    description: 'Ustawia przypomnienie na konkretny czas.',
    input_schema: {
      type: 'object',
      properties: {
        message:  { type: 'string', description: 'Treść przypomnienia' },
        datetime: { type: 'string', description: 'Kiedy przypomnieć — ISO 8601, np. 2025-06-15T09:00:00' }
      },
      required: ['message', 'datetime']
    }
  }
];

async function runTool(name, input) {
  switch (name) {
    case 'calendar_list':    return listEvents(input.days || 7);
    case 'calendar_create':  return createEvent(input);
    case 'email_list':       return listEmails(input.count || 5, input.query);
    case 'email_send':       return sendEmail(input.to, input.subject, input.body);
    case 'shopping_list_get':  return getShoppingList();
    case 'shopping_list_add':  return addToList(input.items);
    case 'shopping_list_done': return removeItem(input.item_id);
    case 'add_reminder':       return addReminder(input.message, input.datetime);
    default: return { error: `Nieznane narzędzie: ${name}` };
  }
}

export async function chat(channel, sender, userMessage) {
  const history = getHistory(channel, sender, 20);
  saveMessage(channel, sender, 'user', userMessage);

  const messages = [
    ...history,
    { role: 'user', content: userMessage }
  ];

  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages
  });

  // Agentic loop — obsługa tool_use
  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const toolResults = [];

    for (const block of toolUseBlocks) {
      let result;
      try {
        result = await runTool(block.name, block.input);
      } catch (err) {
        result = { error: String(err.message) };
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result)
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages
    });
  }

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

  saveMessage(channel, sender, 'assistant', text);
  return text;
}
