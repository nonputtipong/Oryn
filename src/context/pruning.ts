// src/context/pruning.ts — Session context pruning

import type { ConversationMessage } from "../types.js";

/** Rough token estimate: ~4 characters per token */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/** Estimate total tokens in conversation history */
export function estimateHistoryTokens(messages: ConversationMessage[]): number {
    let total = 0;
    for (const msg of messages) {
        if (typeof msg.content === "string") {
            total += estimateTokens(msg.content);
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if ("text" in part && typeof part.text === "string") {
                    total += estimateTokens(part.text);
                }
            }
        }
    }
    return total;
}

/**
 * Prune conversation history by summarizing old messages.
 * Returns a new array with old messages replaced by a summary.
 *
 * @param messages - Full conversation history
 * @param maxTokens - Max tokens before pruning triggers (default: 6000)
 * @param keepRecent - Number of recent messages to always keep (default: 10)
 */
export function pruneHistory(
    messages: ConversationMessage[],
    maxTokens: number = 6000,
    keepRecent: number = 10
): { messages: ConversationMessage[]; wasPruned: boolean; summary: string } {
    const totalTokens = estimateHistoryTokens(messages);

    if (totalTokens <= maxTokens || messages.length <= keepRecent) {
        return { messages, wasPruned: false, summary: "" };
    }

    // Split into old (to summarize) and recent (to keep)
    const splitIndex = messages.length - keepRecent;
    const oldMessages = messages.slice(0, splitIndex);
    const recentMessages = messages.slice(splitIndex);

    // Build a text summary of old messages
    const summaryParts: string[] = [];
    for (const msg of oldMessages) {
        const role = msg.role;
        let text = "";
        if (typeof msg.content === "string") {
            text = msg.content.substring(0, 200);
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if ("text" in part && typeof part.text === "string") {
                    text += part.text.substring(0, 100);
                }
            }
        }
        if (text) {
            summaryParts.push(`[${role}]: ${text}`);
        }
    }

    const summary = `[Earlier conversation summary - ${oldMessages.length} messages condensed]\n${summaryParts.join("\n").substring(0, 1500)}`;

    const prunedMessages: ConversationMessage[] = [
        {
            role: "user",
            content: `[System: The following is a summary of our earlier conversation]\n${summary}`,
        },
        {
            role: "assistant",
            content: "I understand. I have the context from our earlier conversation. Let's continue.",
        },
        ...recentMessages,
    ];

    return { messages: prunedMessages, wasPruned: true, summary };
}

/** Force compact — more aggressive pruning */
export function compactHistory(messages: ConversationMessage[]): {
    messages: ConversationMessage[];
    summary: string;
} {
    const result = pruneHistory(messages, 0, 4);
    return { messages: result.messages, summary: result.summary };
}
