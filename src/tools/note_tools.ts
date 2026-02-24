// src/tools/note_tools.ts — Markdown note tools for the agent

import { saveNote, readNote, listNotes, deleteNote } from "../memory/markdown.js";
import type { RegisteredTool } from "../types.js";

export const saveNoteTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "save_note",
            description: "Save content as a named Markdown note. Notes are human-readable .md files stored locally.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Note name (used as filename)" },
                    content: { type: "string", description: "Note content in Markdown format" },
                },
                required: ["name", "content"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const path = await saveNote(input.name as string, input.content as string);
        return JSON.stringify({ success: true, path, message: `Note "${input.name}" saved` });
    },
};

export const readNoteTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "read_note",
            description: "Read a saved Markdown note by name.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Note name to read" },
                },
                required: ["name"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const content = await readNote(input.name as string);
        if (!content) {
            return JSON.stringify({ found: false, message: `Note "${input.name}" not found` });
        }
        return JSON.stringify({ found: true, name: input.name, content });
    },
};

export const listNotesTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "list_notes",
            description: "List all saved Markdown notes.",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    handler: async (): Promise<string> => {
        const notes = await listNotes();
        return JSON.stringify({ count: notes.length, notes });
    },
};

export const deleteNoteTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "delete_note",
            description: "Delete a saved Markdown note by name.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Note name to delete" },
                },
                required: ["name"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const success = await deleteNote(input.name as string);
        return JSON.stringify({ success, message: success ? `Deleted "${input.name}"` : `Note "${input.name}" not found` });
    },
};
