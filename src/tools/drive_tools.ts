// src/tools/drive_tools.ts — Google Drive tools for the LLM agent

import type { RegisteredTool } from "../types.js";
import { isDriveAvailable, searchFiles, listFiles, readFile } from "../channels/drive.js";

const NOT_CONFIGURED = JSON.stringify({ error: "Google Drive not configured — set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and re-auth with drive scope" });

export const searchDriveFilesTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "search_drive_files",
            description: "Search for files on Google Drive by keyword. Returns file names, types, and links.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search keyword or phrase to find in file names and content" },
                    max_results: { type: "number", description: "Maximum number of files to return (default: 10)" },
                },
                required: ["query"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isDriveAvailable()) return NOT_CONFIGURED;
        try {
            const files = await searchFiles(
                input.query as string,
                (input.max_results as number) || 10,
            );
            return JSON.stringify({ count: files.length, files });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};

export const listDriveFilesTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "list_drive_files",
            description: "List recent files on Google Drive, sorted by last modified time.",
            parameters: {
                type: "object",
                properties: {
                    max_results: { type: "number", description: "Maximum number of files to return (default: 10)" },
                },
                required: [],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isDriveAvailable()) return NOT_CONFIGURED;
        try {
            const files = await listFiles((input.max_results as number) || 10);
            return JSON.stringify({ count: files.length, files });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};

export const readDriveFileTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "read_drive_file",
            description: "Read the content of a specific file from Google Drive by its file ID. For Google Docs, exports as plain text. For Google Sheets, exports as CSV.",
            parameters: {
                type: "object",
                properties: {
                    file_id: { type: "string", description: "The Google Drive file ID" },
                },
                required: ["file_id"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isDriveAvailable()) return NOT_CONFIGURED;
        try {
            const result = await readFile(input.file_id as string);
            return JSON.stringify(result);
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};
