// src/channels/gmail.ts — Gmail integration via Google APIs

import type { Channel } from "./router.js";
import type { RegisteredTool } from "../types.js";

// Gmail API types (inline to avoid googleapis dependency weight at compile time)
interface GmailCredentials {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
}

interface EmailMessage {
    id: string;
    threadId: string;
    from: string;
    to: string;
    subject: string;
    body: string;
    date: string;
    snippet: string;
}

let credentials: GmailCredentials | null = null;
let accessToken: string | null = null;
let tokenExpiry: number = 0;

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Initialize Gmail with OAuth2 credentials.
 */
export function initGmail(creds: GmailCredentials): void {
    credentials = creds;
    console.log("✅ Gmail integration initialized");
}

/**
 * Refresh the access token using the refresh token.
 */
async function refreshAccessToken(): Promise<string> {
    if (!credentials) throw new Error("Gmail not initialized");
    if (accessToken && Date.now() < tokenExpiry) return accessToken;

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            refresh_token: credentials.refreshToken,
            grant_type: "refresh_token",
        }),
    });

    const data = await response.json() as { access_token: string; expires_in: number };
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1min early
    return accessToken;
}

/**
 * Make an authenticated Gmail API request.
 */
async function gmailFetch(path: string, options: RequestInit = {}): Promise<unknown> {
    const token = await refreshAccessToken();
    const response = await fetch(`${GMAIL_API}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gmail API error: ${response.status} ${error}`);
    }

    return response.json();
}

/**
 * List recent emails.
 */
export async function listEmails(maxResults: number = 10, query?: string): Promise<EmailMessage[]> {
    const q = query ? `&q=${encodeURIComponent(query)}` : "";
    const data = await gmailFetch(`/messages?maxResults=${maxResults}${q}`) as any;

    if (!data.messages) return [];

    const emails: EmailMessage[] = [];
    for (const msg of data.messages.slice(0, maxResults)) {
        try {
            const detail = await gmailFetch(`/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`) as any;
            const headers = detail.payload?.headers || [];
            const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || "";

            emails.push({
                id: detail.id,
                threadId: detail.threadId,
                from: getHeader("From"),
                to: getHeader("To"),
                subject: getHeader("Subject"),
                date: getHeader("Date"),
                body: "",
                snippet: detail.snippet || "",
            });
        } catch {
            // Skip failed messages
        }
    }
    return emails;
}

/**
 * Read a specific email.
 */
export async function readEmail(messageId: string): Promise<EmailMessage | null> {
    try {
        const detail = await gmailFetch(`/messages/${messageId}?format=full`) as any;
        const headers = detail.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || "";

        // Extract body from parts
        let body = "";
        if (detail.payload?.body?.data) {
            body = Buffer.from(detail.payload.body.data, "base64url").toString("utf-8");
        } else if (detail.payload?.parts) {
            const textPart = detail.payload.parts.find((p: any) => p.mimeType === "text/plain");
            if (textPart?.body?.data) {
                body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
            }
        }

        return {
            id: detail.id,
            threadId: detail.threadId,
            from: getHeader("From"),
            to: getHeader("To"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            body,
            snippet: detail.snippet || "",
        };
    } catch (err) {
        console.warn(`  ⚠️ Failed to read email ${messageId}: ${(err as Error).message}`);
        return null;
    }
}

/**
 * Send an email.
 */
export async function sendEmail(to: string, subject: string, body: string): Promise<string> {
    const raw = Buffer.from(
        `To: ${to}\r\n` +
        `Subject: ${subject}\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
        body
    ).toString("base64url");

    const result = await gmailFetch("/messages/send", {
        method: "POST",
        body: JSON.stringify({ raw }),
    }) as any;

    return result.id;
}

/**
 * Reply to an email.
 */
export async function replyToEmail(messageId: string, body: string): Promise<string> {
    const original = await readEmail(messageId);
    if (!original) throw new Error("Original message not found");

    const raw = Buffer.from(
        `To: ${original.from}\r\n` +
        `Subject: Re: ${original.subject}\r\n` +
        `In-Reply-To: ${messageId}\r\n` +
        `References: ${messageId}\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
        body
    ).toString("base64url");

    const result = await gmailFetch("/messages/send", {
        method: "POST",
        body: JSON.stringify({ raw, threadId: original.threadId }),
    }) as any;

    return result.id;
}

// ── Gmail as a channel ──────────────────────────────────────────────

export const gmailChannel: Channel = {
    id: "gmail",
    type: "gmail",
    formatOutbound(text: string): string {
        // Convert markdown to basic HTML for email
        return text
            .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
            .replace(/\*(.*?)\*/g, "<i>$1</i>")
            .replace(/\n/g, "<br>");
    },
    parseInbound(raw: unknown): string {
        if (typeof raw === "string") return raw;
        const msg = raw as EmailMessage;
        return `[Email from ${msg.from}] Subject: ${msg.subject}\n\n${msg.body || msg.snippet}`;
    },
};

export function isGmailAvailable(): boolean {
    return credentials !== null;
}
