// src/security/secrets.ts — AES-256-GCM encrypted secret storage

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { getDatabase } from "../memory/sqlite.js";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT = "oryn-secrets-v1";

let derivedKey: Buffer | null = null;

/**
 * Initialize the secrets module with a master key.
 * Derives an encryption key using scrypt.
 */
export function initSecrets(masterKey: string): void {
    derivedKey = scryptSync(masterKey, SALT, KEY_LENGTH);

    // Ensure secrets table exists
    const db = getDatabase();
    db.exec(`
    CREATE TABLE IF NOT EXISTS secrets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      encrypted_value TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

    console.log("✅ Encrypted secret storage initialized");
}

/**
 * Encrypt and store a secret.
 */
export function storeSecret(name: string, value: string): void {
    if (!derivedKey) throw new Error("Secrets not initialized — set MASTER_KEY in .env");

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, derivedKey, iv);

    let encrypted = cipher.update(value, "utf-8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    const db = getDatabase();
    db.prepare(`
    INSERT INTO secrets (name, encrypted_value, iv, auth_tag)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      encrypted_value = excluded.encrypted_value,
      iv = excluded.iv,
      auth_tag = excluded.auth_tag,
      created_at = datetime('now')
  `).run(name, encrypted, iv.toString("hex"), authTag);

    console.log(`  🔐 Secret stored: ${name}`);
}

/**
 * Decrypt and retrieve a secret.
 */
export function getSecret(name: string): string | null {
    if (!derivedKey) throw new Error("Secrets not initialized — set MASTER_KEY in .env");

    const db = getDatabase();
    const row = db.prepare("SELECT encrypted_value, iv, auth_tag FROM secrets WHERE name = ?")
        .get(name) as { encrypted_value: string; iv: string; auth_tag: string } | undefined;

    if (!row) return null;

    const decipher = createDecipheriv(
        ALGORITHM,
        derivedKey,
        Buffer.from(row.iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(row.auth_tag, "hex"));

    let decrypted = decipher.update(row.encrypted_value, "hex", "utf-8");
    decrypted += decipher.final("utf-8");

    return decrypted;
}

/**
 * Delete a secret.
 */
export function deleteSecret(name: string): boolean {
    const db = getDatabase();
    const result = db.prepare("DELETE FROM secrets WHERE name = ?").run(name);
    return result.changes > 0;
}

/**
 * List all secret names (never values).
 */
export function listSecretNames(): string[] {
    const db = getDatabase();
    const rows = db.prepare("SELECT name FROM secrets ORDER BY name").all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
}

export function isSecretsAvailable(): boolean {
    return derivedKey !== null;
}
