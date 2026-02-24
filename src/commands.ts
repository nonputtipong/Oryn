// src/commands.ts — Slash command handlers

import type { Agent } from "./agent.js";

const startTime = Date.now();

export interface CommandContext {
    agent: Agent;
    userId: number;
    model: string;
}

export interface CommandResult {
    text: string;
    handled: boolean;
}

/** Process a slash command. Returns { handled: true, text } if it was a command. */
export function handleSlashCommand(
    command: string,
    args: string,
    ctx: CommandContext
): CommandResult {
    switch (command) {
        case "status":
            return { handled: true, text: getStatus(ctx) };
        case "new":
            ctx.agent.clearHistory();
            return { handled: true, text: "🗑️ Conversation cleared. Starting fresh!" };
        case "compact":
            return { handled: true, text: "✂️ Context pruning triggered. (Active after Feature 6 is wired)" };
        case "model": {
            if (args.trim()) {
                ctx.agent.setModel(args.trim());
                return { handled: true, text: `🔄 Model switched to: \`${args.trim()}\`` };
            }
            return { handled: true, text: `🤖 Current model: \`${ctx.agent.getModel()}\`\n\nTo switch: \`/model <model_id>\`\nExamples:\n• \`/model google/gemini-2.0-flash-001\`\n• \`/model anthropic/claude-sonnet-4.5\`\n• \`/model openai/gpt-4o\`` };
        }
        case "usage": {
            const usage = ctx.agent.getUsage();
            return {
                handled: true,
                text: `📊 *Usage Stats*\n\n• Messages in context: ${usage.historyLength}\n• Total tokens used: ~${usage.totalTokens}\n• Model: \`${ctx.agent.getModel()}\``,
            };
        }
        default:
            return { handled: false, text: "" };
    }
}

function getStatus(ctx: CommandContext): string {
    const uptimeMs = Date.now() - startTime;
    const uptimeMin = Math.floor(uptimeMs / 60000);
    const uptimeHrs = Math.floor(uptimeMin / 60);
    const uptime = uptimeHrs > 0 ? `${uptimeHrs}h ${uptimeMin % 60}m` : `${uptimeMin}m`;

    return (
        `🤖 *Gravity Claw Status*\n\n` +
        `• Uptime: ${uptime}\n` +
        `• Model: \`${ctx.agent.getModel()}\`\n` +
        `• Context length: ${ctx.agent.historyLength} messages\n` +
        `• Node: ${process.version}`
    );
}
