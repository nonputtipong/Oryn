// src/tools/gmail_tools.ts — Gmail tools for the agent

import { listEmails, readEmail, sendEmail, replyToEmail, isGmailAvailable } from "../channels/gmail.js";
import type { RegisteredTool } from "../types.js";

export const listEmailsTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "list_emails",
            description: "List recent emails from Gmail. Optionally filter with a search query.",
            parameters: {
                type: "object",
                properties: {
                    max_results: { type: "number", description: "Max emails to return (default 10)" },
                    query: { type: "string", description: "Gmail search query (e.g., 'from:john', 'is:unread', 'subject:invoice')" },
                },
                required: [],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isGmailAvailable()) return JSON.stringify({ error: "Gmail not configured — set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN" });
        try {
            const emails = await listEmails(
                (input.max_results as number) || 10,
                input.query as string | undefined
            );
            return JSON.stringify({
                count: emails.length, emails: emails.map(e => ({
                    id: e.id,
                    from: e.from,
                    subject: e.subject,
                    date: e.date,
                    snippet: e.snippet.substring(0, 100),
                }))
            });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};

export const readEmailTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "read_email",
            description: "Read the full content of a specific email by its message ID.",
            parameters: {
                type: "object",
                properties: {
                    message_id: { type: "string", description: "Gmail message ID" },
                },
                required: ["message_id"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isGmailAvailable()) return JSON.stringify({ error: "Gmail not configured" });
        const email = await readEmail(input.message_id as string);
        if (!email) return JSON.stringify({ error: "Email not found" });
        return JSON.stringify(email);
    },
};

export const sendEmailTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "send_email",
            description: "Compose and send a new email via Gmail.",
            parameters: {
                type: "object",
                properties: {
                    to: { type: "string", description: "Recipient email address" },
                    subject: { type: "string", description: "Email subject" },
                    body: { type: "string", description: "Email body text" },
                },
                required: ["to", "subject", "body"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isGmailAvailable()) return JSON.stringify({ error: "Gmail not configured" });
        try {
            const id = await sendEmail(
                input.to as string,
                input.subject as string,
                input.body as string
            );
            return JSON.stringify({ success: true, messageId: id });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};

export const replyEmailTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "reply_email",
            description: "Reply to an existing email thread.",
            parameters: {
                type: "object",
                properties: {
                    message_id: { type: "string", description: "Original message ID to reply to" },
                    body: { type: "string", description: "Reply body text" },
                },
                required: ["message_id", "body"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isGmailAvailable()) return JSON.stringify({ error: "Gmail not configured" });
        try {
            const id = await replyToEmail(
                input.message_id as string,
                input.body as string
            );
            return JSON.stringify({ success: true, messageId: id });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};
