// src/memory/markdown.ts — Markdown-based persistent notes

import { readFile, writeFile, readdir, unlink, mkdir } from "fs/promises";
import { resolve, basename, extname } from "path";
import { existsSync } from "fs";

const NOTES_DIR = resolve(process.cwd(), "data", "notes");

async function ensureNotesDir(): Promise<void> {
    if (!existsSync(NOTES_DIR)) {
        await mkdir(NOTES_DIR, { recursive: true });
    }
}

function sanitizeName(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9_-\s]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase()
        .substring(0, 100);
}

export async function saveNote(name: string, content: string): Promise<string> {
    await ensureNotesDir();
    const filename = sanitizeName(name) + ".md";
    const filePath = resolve(NOTES_DIR, filename);
    const header = `# ${name}\n\n_Updated: ${new Date().toISOString()}_\n\n`;
    await writeFile(filePath, header + content, "utf-8");
    return filePath;
}

export async function readNote(name: string): Promise<string | null> {
    const filename = sanitizeName(name) + ".md";
    const filePath = resolve(NOTES_DIR, filename);
    try {
        return await readFile(filePath, "utf-8");
    } catch {
        return null;
    }
}

export async function listNotes(): Promise<Array<{ name: string; size: number; modified: string }>> {
    await ensureNotesDir();
    try {
        const files = await readdir(NOTES_DIR, { withFileTypes: true });
        const notes = [];
        for (const file of files) {
            if (file.isFile() && extname(file.name) === ".md") {
                const filePath = resolve(NOTES_DIR, file.name);
                const { size, mtime } = await import("fs").then((fs) =>
                    fs.promises.stat(filePath)
                );
                notes.push({
                    name: basename(file.name, ".md"),
                    size,
                    modified: mtime.toISOString(),
                });
            }
        }
        return notes;
    } catch {
        return [];
    }
}

export async function deleteNote(name: string): Promise<boolean> {
    const filename = sanitizeName(name) + ".md";
    const filePath = resolve(NOTES_DIR, filename);
    try {
        await unlink(filePath);
        return true;
    } catch {
        return false;
    }
}
