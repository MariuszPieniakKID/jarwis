import { db } from '../db.js';

export function getShoppingList() {
  const items = db.prepare(
    'SELECT id, item, qty, done FROM shopping_list ORDER BY done ASC, added_at ASC'
  ).all();
  return { items, count: items.length };
}

export function addToList(items) {
  const stmt = db.prepare('INSERT INTO shopping_list(item, qty) VALUES(?, ?)');
  const added = [];
  for (const { item, qty } of items) {
    const res = stmt.run(item.trim(), qty || null);
    added.push({ id: res.lastInsertRowid, item, qty });
  }
  return { added, total: added.length };
}

export function removeItem(id) {
  db.prepare('UPDATE shopping_list SET done = 1 WHERE id = ?').run(id);
  return { success: true, id };
}

export function clearList() {
  db.prepare('DELETE FROM shopping_list WHERE done = 1').run();
  return { success: true };
}
