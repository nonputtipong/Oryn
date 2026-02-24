// src/memory/sqlite.ts — SQLite persistent memory with FTS5 + sqlite-vec

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { resolve } from "path";
import { mkdirSync, existsSync } from "fs";

const DATA_DIR = resolve(process.cwd(), "data");
const DB_PATH = resolve(DATA_DIR, "gravity-claw.db");

let db: Database.Database;

export function initDatabase(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Load sqlite-vec extension for vector search
  sqliteVec.load(db);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      access_count INTEGER DEFAULT 0,
      relevance_score REAL DEFAULT 1.0
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      summary TEXT NOT NULL,
      messages TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT DEFAULT 'thing',
      properties TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_entity_id INTEGER NOT NULL,
      to_entity_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      properties TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cron_expr TEXT NOT NULL,
      message TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Create FTS5 virtual table for full-text search on facts
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
      content,
      category,
      content_rowid='id',
      content='facts'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
      INSERT INTO facts_fts(rowid, content, category) VALUES (new.id, new.content, new.category);
    END;

    CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
      INSERT INTO facts_fts(facts_fts, rowid, content, category) VALUES ('delete', old.id, old.content, old.category);
    END;

    CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
      INSERT INTO facts_fts(facts_fts, rowid, content, category) VALUES ('delete', old.id, old.content, old.category);
      INSERT INTO facts_fts(rowid, content, category) VALUES (new.id, new.content, new.category);
    END;
  `);

  // Create sqlite-vec virtual table for vector similarity search
  // 1536 dimensions = OpenAI text-embedding-3-small
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS facts_vec USING vec0(
      embedding float[1536]
    );
  `);

  console.log(`✅ SQLite database initialized (FTS5 + sqlite-vec) at ${DB_PATH}`);
  return db;
}

// ── Fact operations ──────────────────────────────────────────────────

export function storeFact(content: string, category: string = "general"): number {
  const d = initDatabase();
  const result = d.prepare("INSERT INTO facts (content, category) VALUES (?, ?)").run(content, category);
  return result.lastInsertRowid as number;
}

export function searchFacts(query: string, limit: number = 10): Array<{ id: number; content: string; category: string; relevance_score: number }> {
  const d = initDatabase();
  try {
    // Try FTS5 search first
    const rows = d.prepare(`
      SELECT f.id, f.content, f.category, f.relevance_score
      FROM facts_fts fts
      JOIN facts f ON f.id = fts.rowid
      WHERE facts_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as Array<{ id: number; content: string; category: string; relevance_score: number }>;

    // Update access counts
    for (const row of rows) {
      d.prepare("UPDATE facts SET access_count = access_count + 1, updated_at = datetime('now') WHERE id = ?").run(row.id);
    }

    return rows;
  } catch {
    // Fallback to LIKE search
    return d.prepare(`
      SELECT id, content, category, relevance_score
      FROM facts
      WHERE content LIKE ?
      ORDER BY relevance_score DESC
      LIMIT ?
    `).all(`%${query}%`, limit) as Array<{ id: number; content: string; category: string; relevance_score: number }>;
  }
}

export function getAllFacts(limit: number = 50): Array<{ id: number; content: string; category: string; created_at: string }> {
  const d = initDatabase();
  return d.prepare("SELECT id, content, category, created_at FROM facts ORDER BY created_at DESC LIMIT ?").all(limit) as Array<{ id: number; content: string; category: string; created_at: string }>;
}

export function deleteFact(id: number): boolean {
  const d = initDatabase();
  const result = d.prepare("DELETE FROM facts WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getFactCount(): number {
  const d = initDatabase();
  return (d.prepare("SELECT COUNT(*) as count FROM facts").get() as { count: number }).count;
}

export function getRecentFacts(limit: number = 5): Array<{ content: string; category: string }> {
  const d = initDatabase();
  return d.prepare("SELECT content, category FROM facts ORDER BY created_at DESC LIMIT ?").all(limit) as Array<{ content: string; category: string }>;
}

// ── Conversation operations ──────────────────────────────────────────

export function storeConversationSummary(userId: number, summary: string): number {
  const d = initDatabase();
  const result = d.prepare("INSERT INTO conversations (user_id, summary) VALUES (?, ?)").run(userId, summary);
  return result.lastInsertRowid as number;
}

export function getRecentConversations(userId: number, limit: number = 5): Array<{ summary: string; created_at: string }> {
  const d = initDatabase();
  return d.prepare("SELECT summary, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(userId, limit) as Array<{ summary: string; created_at: string }>;
}

// ── Export database getter ───────────────────────────────────────────

export function getDatabase(): Database.Database {
  return initDatabase();
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    console.log("🗄️ Database closed");
  }
}
