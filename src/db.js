import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, '..', 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, 'jarwis.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    channel   TEXT NOT NULL,
    sender    TEXT NOT NULL,
    role      TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content   TEXT NOT NULL,
    ts        INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS shopping_list (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    item      TEXT NOT NULL,
    qty       TEXT,
    done      INTEGER NOT NULL DEFAULT 0,
    added_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    message   TEXT NOT NULL,
    fire_at   INTEGER NOT NULL,
    channel   TEXT NOT NULL DEFAULT 'whatsapp',
    sent      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS config (
    key       TEXT PRIMARY KEY,
    value     TEXT NOT NULL
  );
`);

export const getConfig = (key) => {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
};

export const setConfig = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO config(key, value) VALUES(?,?)').run(key, value);
};

export const saveMessage = (channel, sender, role, content) => {
  db.prepare(
    'INSERT INTO conversations(channel,sender,role,content) VALUES(?,?,?,?)'
  ).run(channel, sender, role, content);
};

export const getHistory = (channel, sender, limit = 20) => {
  return db.prepare(
    `SELECT role, content FROM conversations
     WHERE channel=? AND sender=?
     ORDER BY ts DESC LIMIT ?`
  ).all(channel, sender, limit).reverse();
};
