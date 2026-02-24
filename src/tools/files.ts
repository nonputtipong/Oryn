// src/tools/files.ts — File system operations with safety controls

import { readFile, writeFile, readdir, unlink, stat, mkdir } from "fs/promises";
import { resolve, relative, basename, extname, dirname } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import type { RegisteredTool } from "../types.js";

const MAX_FILE_SIZE = 100 * 1024; // 100KB
const HOME = homedir();
const PROJECT_ROOT = process.cwd();

/** Validate that a path is within allowed directories */
function validatePath(filePath: string): string | null {
    const resolved = resolve(filePath);
    if (!resolved.startsWith(HOME)) {
        return `Path must be within home directory: ${HOME}`;
    }
    // Block sensitive paths
    const blocked = [".ssh", ".gnupg", ".env", ".git/config"];
    for (const b of blocked) {
        if (resolved.includes(b)) {
            return `Access to ${b} is blocked for security`;
        }
    }
    return null;
}

export const readFileTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "read_file",
            description: "Read the contents of a file. Max 100KB. Path must be within home directory.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Absolute or relative path to the file" },
                    encoding: { type: "string", description: "File encoding (default: utf-8)" },
                },
                required: ["path"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const filePath = resolve(input.path as string);
        const error = validatePath(filePath);
        if (error) return JSON.stringify({ error });

        try {
            const stats = await stat(filePath);
            if (stats.size > MAX_FILE_SIZE) {
                return JSON.stringify({ error: `File too large: ${stats.size} bytes (max ${MAX_FILE_SIZE})` });
            }
            const content = await readFile(filePath, (input.encoding as BufferEncoding) || "utf-8");
            return JSON.stringify({ path: filePath, size: stats.size, content });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};

export const writeFileTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "write_file",
            description: "Write content to a file. Creates parent directories if needed. Max 100KB.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Absolute or relative path to the file" },
                    content: { type: "string", description: "Content to write" },
                    append: { type: "boolean", description: "Append to file instead of overwriting (default: false)" },
                },
                required: ["path", "content"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const filePath = resolve(input.path as string);
        const content = input.content as string;
        const append = input.append as boolean || false;
        const error = validatePath(filePath);
        if (error) return JSON.stringify({ error });

        if (Buffer.byteLength(content) > MAX_FILE_SIZE) {
            return JSON.stringify({ error: `Content too large (max ${MAX_FILE_SIZE} bytes)` });
        }

        try {
            await mkdir(dirname(filePath), { recursive: true });
            if (append) {
                const existing = existsSync(filePath) ? await readFile(filePath, "utf-8") : "";
                await writeFile(filePath, existing + content, "utf-8");
            } else {
                await writeFile(filePath, content, "utf-8");
            }
            return JSON.stringify({ success: true, path: filePath, bytes: Buffer.byteLength(content) });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};

export const listDirectoryTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "list_directory",
            description: "List files and directories in a given path. Shows name, type, and size.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Directory path to list" },
                    recursive: { type: "boolean", description: "List recursively (default: false, max depth 2)" },
                },
                required: ["path"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const dirPath = resolve(input.path as string);
        const error = validatePath(dirPath);
        if (error) return JSON.stringify({ error });

        try {
            const entries = await readdir(dirPath, { withFileTypes: true });
            const items = await Promise.all(
                entries.slice(0, 100).map(async (entry) => {
                    const fullPath = resolve(dirPath, entry.name);
                    try {
                        const stats = await stat(fullPath);
                        return {
                            name: entry.name,
                            type: entry.isDirectory() ? "directory" : "file",
                            size: entry.isFile() ? stats.size : undefined,
                            modified: stats.mtime.toISOString(),
                        };
                    } catch {
                        return { name: entry.name, type: "unknown" };
                    }
                })
            );
            return JSON.stringify({ path: dirPath, count: items.length, items });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};

export const deleteFileTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "delete_file",
            description: "Delete a single file. Cannot delete directories.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Path to the file to delete" },
                },
                required: ["path"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const filePath = resolve(input.path as string);
        const error = validatePath(filePath);
        if (error) return JSON.stringify({ error });

        try {
            const stats = await stat(filePath);
            if (stats.isDirectory()) {
                return JSON.stringify({ error: "Cannot delete directories, only files" });
            }
            await unlink(filePath);
            return JSON.stringify({ success: true, deleted: filePath });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};
