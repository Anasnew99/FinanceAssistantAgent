import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export type CategoryType = 'investment' | 'user';
export type TransactionType = 'debit' | 'credit';

const dataDir = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'finance.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ownerid TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('investment','user')),
  UNIQUE(ownerid, name, type)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ownerid TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('debit','credit')),
  amount REAL NOT NULL CHECK (amount >= 0),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_categories_ownerid ON categories(ownerid);
CREATE INDEX IF NOT EXISTS idx_transactions_ownerid ON transactions(ownerid);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
`);

// Lightweight migration: rename userid -> ownerid if needed
try {
  const categoryCols = db.prepare(`PRAGMA table_info(categories)`).all() as { name: string }[];
  const hasUserId = categoryCols.some((c) => c.name === 'userid');
  const hasOwnerId = categoryCols.some((c) => c.name === 'ownerid');
  if (hasUserId && !hasOwnerId) {
    db.exec(`ALTER TABLE categories RENAME COLUMN userid TO ownerid;`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_categories_ownerid ON categories(ownerid);`);
  }
} catch {}
try {
  const txCols = db.prepare(`PRAGMA table_info(transactions)`).all() as { name: string }[];
  const hasUserIdTx = txCols.some((c) => c.name === 'userid');
  const hasOwnerIdTx = txCols.some((c) => c.name === 'ownerid');
  if (hasUserIdTx && !hasOwnerIdTx) {
    db.exec(`ALTER TABLE transactions RENAME COLUMN userid TO ownerid;`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_ownerid ON transactions(ownerid);`);
  }
} catch {}

export function ensureCategory(
  ownerid: string,
  name: string,
  type: CategoryType
): number {
  const existing = db
    .prepare(
      `SELECT id FROM categories WHERE ownerid = ? AND name = ? AND type = ?`
    )
    .get(ownerid, name, type) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = db
    .prepare(
      `INSERT INTO categories (ownerid, name, type) VALUES (?, ?, ?)`
    )
    .run(ownerid, name, type);
  return Number(info.lastInsertRowid);
}

export function nowIso(): string {
  return new Date().toISOString();
}

