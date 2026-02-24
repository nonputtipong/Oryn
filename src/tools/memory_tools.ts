// src/tools/memory_tools.ts — Memory tools for the agent

import { storeFact, searchFacts, getAllFacts, deleteFact } from "../memory/sqlite.js";
import type { RegisteredTool } from "../types.js";

export const rememberFact: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "remember_fact",
            description: "Store a fact, preference, or piece of information in persistent memory. Use categories like 'preference', 'fact', 'person', 'project', 'todo'.",
            parameters: {
                type: "object",
                properties: {
                    content: { type: "string", description: "The fact or information to remember" },
                    category: { type: "string", description: "Category: preference, fact, person, project, todo, general" },
                },
                required: ["content"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const content = input.content as string;
        const category = (input.category as string) || "general";
        const id = storeFact(content, category);
        return JSON.stringify({ success: true, id, message: `Remembered: "${content}" [${category}]` });
    },
};

export const recallFacts: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "recall_facts",
            description: "Search persistent memory for facts matching a query. Uses full-text search.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search query to find relevant memories" },
                    limit: { type: "number", description: "Max results (default: 10)" },
                },
                required: ["query"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const query = input.query as string;
        const limit = (input.limit as number) || 10;
        const results = searchFacts(query, limit);
        return JSON.stringify({
            query,
            count: results.length,
            memories: results.map((r) => ({ id: r.id, content: r.content, category: r.category })),
        });
    },
};

export const listMemories: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "list_memories",
            description: "List all stored memories/facts, most recent first.",
            parameters: {
                type: "object",
                properties: {
                    limit: { type: "number", description: "Max results (default: 20)" },
                },
                required: [],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const limit = (input.limit as number) || 20;
        const facts = getAllFacts(limit);
        return JSON.stringify({ count: facts.length, memories: facts });
    },
};

export const forgetFact: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "forget_fact",
            description: "Delete a specific memory by its ID.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "number", description: "The ID of the memory to delete" },
                },
                required: ["id"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const id = input.id as number;
        const success = deleteFact(id);
        return JSON.stringify({ success, message: success ? `Deleted memory #${id}` : `Memory #${id} not found` });
    },
};
