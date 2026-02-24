// src/index.ts — Entry point: Telegram bot with all features wired

import { Bot, InputFile } from "grammy";
import { loadConfig } from "./config.js";
import { isAllowedUser } from "./guard.js";
import { Agent } from "./agent.js";
import { handleSlashCommand } from "./commands.js";
import { initDatabase, closeDatabase } from "./memory/sqlite.js";
import { evolveMemory } from "./memory/memory_evolution.js";
import { initEmbeddings } from "./memory/embeddings.js";
import { initExtraction } from "./memory/extraction.js";
import { initWhisper, transcribeAudio, isWhisperAvailable } from "./voice/transcribe.js";
import { initTTS, textToSpeech, isTTSAvailable } from "./voice/tts.js";
import { setMessageCallback, restoreScheduledTasks } from "./scheduler/cron.js";

// New features
import { initSecrets } from "./security/secrets.js";
import { initSandbox } from "./security/sandbox.js";
import { initMCPBridge, getMCPTools } from "./mcp/mcp_bridge.js";
import { messageBus } from "./channels/router.js";
import { initGmail } from "./channels/gmail.js";
import { initCalendar } from "./channels/calendar.js";
import { initDrive } from "./channels/drive.js";
import { initBriefing, createMemoryGatherer, createTaskGatherer } from "./proactive/briefing.js";
import { initCanvas } from "./canvas/canvas.js";
import { register } from "./tools/registry.js";
import { getFactCount, getRecentFacts } from "./memory/sqlite.js";
import { listScheduledTasks } from "./scheduler/cron.js";

// ── Load configuration ──────────────────────────────────────────────
console.log("🚀 Starting Gravity Claw...\n");

const config = loadConfig();

// ── Initialize subsystems ────────────────────────────────────────────
initDatabase();
evolveMemory();

// Initialize security
if (config.masterKey) initSecrets(config.masterKey);
initSandbox(config.sandboxEnabled, config.sandboxImage || undefined);

// Initialize embedding + extraction pipeline
initEmbeddings(config.openRouterApiKey);
initExtraction(config.openRouterApiKey);

if (config.groqApiKey) initWhisper(config.groqApiKey);
if (config.elevenLabsApiKey) initTTS(config.elevenLabsApiKey, config.elevenLabsVoiceId);

// Initialize MCP and dynamically register tools
initMCPBridge().then(() => {
    const mcpTools = getMCPTools();
    if (mcpTools.length > 0) {
        for (const tool of mcpTools) register(tool);
        console.log(`  🔌 Registered ${mcpTools.length} dynamic MCP tool(s)`);
    }
});

// Initialize Google services if credentials exist
if (config.gmailClientId && config.gmailClientSecret && config.gmailRefreshToken) {
    const googleCreds = {
        clientId: config.gmailClientId,
        clientSecret: config.gmailClientSecret,
        refreshToken: config.gmailRefreshToken,
    };
    initGmail(googleCreds);
    initCalendar(googleCreds);
    initDrive(googleCreds);
}

// Initialize Live Canvas
initCanvas(config.canvasPort);

// ── Initialize the Telegram bot ──────────────────────────────────────
const bot = new Bot(config.telegramToken);

// Track per-user agents and talk mode
const userAgents = new Map<number, Agent>();
const talkMode = new Set<number>();

function getAgentForUser(userId: number): Agent {
    let userAgent = userAgents.get(userId);
    if (!userAgent) {
        userAgent = new Agent(config.openRouterApiKey, userId);
        userAgents.set(userId, userAgent);
    }
    return userAgent;
}

// ── Wire schedule and briefing ──────────────────────────────────────
const telegramSender = async (userId: number, message: string) => {
    try {
        await bot.api.sendMessage(userId, messageBus.formatOutbound("telegram", message), { parse_mode: "Markdown" });
    } catch {
        await bot.api.sendMessage(userId, message);
    }
};

setMessageCallback(telegramSender);
restoreScheduledTasks();

// Morning Briefing for the primary allowed user (first in array)
if (config.allowedUserIds.length > 0) {
    initBriefing({ time: config.briefingTime, userId: config.allowedUserIds[0] }, telegramSender);
    import("./proactive/briefing.js").then(({ addBriefingGatherer }) => {
        addBriefingGatherer(createMemoryGatherer(getFactCount, getRecentFacts));
        addBriefingGatherer(createTaskGatherer(listScheduledTasks));
    });
}

// ── Helper: send response with optional voice ────────────────────────
async function sendResponse(ctx: any, text: string, userId: number): Promise<void> {
    // Send text response — split if too long
    if (text.length <= 4096) {
        await ctx.reply(text, { parse_mode: "Markdown" }).catch(async () => {
            await ctx.reply(text);
        });
    } else {
        const chunks = splitMessage(text, 4096);
        for (const chunk of chunks) {
            await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(async () => {
                await ctx.reply(chunk);
            });
        }
    }

    // If talk mode is on and TTS is available, also send voice
    if (talkMode.has(userId) && isTTSAvailable()) {
        try {
            const audioBuffer = await textToSpeech(text);
            await ctx.replyWithVoice(new InputFile(audioBuffer, "response.mp3"));
        } catch (err) {
            console.error(`❌ TTS error: ${(err as Error).message}`);
        }
    }
}

// ── Slash commands ───────────────────────────────────────────────────
bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !isAllowedUser(userId, config.allowedUserIds)) return;

    await ctx.reply(
        "🤖 *Gravity Claw online.*\n\n" +
        "I'm your personal AI assistant. Here's what I can do:\n\n" +
        "*Commands:*\n" +
        "• /status — Bot status & stats\n" +
        "• /new — New conversation\n" +
        "• /compact — Compress context\n" +
        "• /model — Switch LLM model\n" +
        "• /usage — Token usage stats\n" +
        "• /talk — Toggle voice replies\n" +
        "• /clear — Reset conversation\n\n" +
        "*Tools:* Memory, knowledge graph, notes, web search, shell commands, file ops, scheduler\n\n" +
        "Just chat naturally — I'll use the right tools automatically.",
        { parse_mode: "Markdown" }
    );
});

bot.command("clear", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !isAllowedUser(userId, config.allowedUserIds)) return;
    getAgentForUser(userId).clearHistory();
    await ctx.reply("🗑️ Conversation cleared. Starting fresh!");
});

bot.command("status", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !isAllowedUser(userId, config.allowedUserIds)) return;
    const agent = getAgentForUser(userId);
    const result = handleSlashCommand("status", "", { agent, userId, model: agent.getModel() });
    await ctx.reply(result.text, { parse_mode: "Markdown" }).catch(() => ctx.reply(result.text));
});

bot.command("new", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !isAllowedUser(userId, config.allowedUserIds)) return;
    getAgentForUser(userId).clearHistory();
    await ctx.reply("🗑️ Conversation cleared. Starting fresh!");
});

bot.command("compact", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !isAllowedUser(userId, config.allowedUserIds)) return;
    const agent = getAgentForUser(userId);
    const summary = agent.compact();
    await ctx.reply(`✂️ Context compacted.\n\n${summary}`);
});

bot.command("model", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !isAllowedUser(userId, config.allowedUserIds)) return;
    const agent = getAgentForUser(userId);
    const args = ctx.match || "";
    const result = handleSlashCommand("model", args, { agent, userId, model: agent.getModel() });
    await ctx.reply(result.text, { parse_mode: "Markdown" }).catch(() => ctx.reply(result.text));
});

bot.command("usage", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !isAllowedUser(userId, config.allowedUserIds)) return;
    const agent = getAgentForUser(userId);
    const result = handleSlashCommand("usage", "", { agent, userId, model: agent.getModel() });
    await ctx.reply(result.text, { parse_mode: "Markdown" }).catch(() => ctx.reply(result.text));
});

bot.command("talk", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !isAllowedUser(userId, config.allowedUserIds)) return;

    if (!isTTSAvailable()) {
        await ctx.reply("🗣️ Talk mode requires ELEVENLABS_API_KEY in .env");
        return;
    }

    if (talkMode.has(userId)) {
        talkMode.delete(userId);
        await ctx.reply("🔇 Talk mode OFF — text replies only");
    } else {
        talkMode.add(userId);
        await ctx.reply("🗣️ Talk mode ON — I'll reply with voice too!");
    }
});

// ── Voice message handler ────────────────────────────────────────────
bot.on("message:voice", async (ctx) => {
    const userId = ctx.from.id;
    if (!isAllowedUser(userId, config.allowedUserIds)) return;

    if (!isWhisperAvailable()) {
        await ctx.reply("🎙️ Voice transcription requires OPENAI_API_KEY in .env");
        return;
    }

    console.log(`\n🎙️ Voice message from ${ctx.from.first_name} (${userId})`);
    await ctx.replyWithChatAction("typing");

    try {
        // Get file URL
        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;

        // Transcribe
        const transcription = await transcribeAudio(fileUrl);
        console.log(`  📝 Transcribed: ${transcription.substring(0, 100)}...`);

        // Show transcription
        await ctx.reply(`🎙️ _"${transcription}"_`, { parse_mode: "Markdown" }).catch(() => { });

        // Process through agent
        const agent = getAgentForUser(userId);
        const response = await agent.handleMessage(transcription);
        await sendResponse(ctx, response, userId);
    } catch (err) {
        console.error(`❌ Voice error: ${(err as Error).message}`);
        await ctx.reply("⚠️ Failed to process voice message. Please try again.");
    }
});

// ── Photo handler ────────────────────────────────────────────────────
bot.on("message:photo", async (ctx) => {
    const userId = ctx.from.id;
    if (!isAllowedUser(userId, config.allowedUserIds)) return;

    const caption = ctx.message.caption || "User sent a photo.";
    console.log(`\n📷 Photo from ${ctx.from.first_name} (${userId}): ${caption}`);
    await ctx.replyWithChatAction("typing");

    try {
        const agent = getAgentForUser(userId);
        const response = await agent.handleMessage(`[User sent a photo with caption: "${caption}"]`);
        await sendResponse(ctx, response, userId);
    } catch (err) {
        console.error(`❌ Error: ${(err as Error).message}`);
        await ctx.reply("⚠️ Something went wrong. Please try again.");
    }
});

// ── Document handler ─────────────────────────────────────────────────
bot.on("message:document", async (ctx) => {
    const userId = ctx.from.id;
    if (!isAllowedUser(userId, config.allowedUserIds)) return;

    const doc = ctx.message.document;
    const caption = ctx.message.caption || "";
    console.log(`\n📄 Document from ${ctx.from.first_name}: ${doc.file_name}`);
    await ctx.replyWithChatAction("typing");

    try {
        const agent = getAgentForUser(userId);
        const response = await agent.handleMessage(
            `[User sent a document: "${doc.file_name}" (${doc.mime_type}, ${doc.file_size} bytes)${caption ? `, caption: "${caption}"` : ""}]`
        );
        await sendResponse(ctx, response, userId);
    } catch (err) {
        console.error(`❌ Error: ${(err as Error).message}`);
        await ctx.reply("⚠️ Something went wrong. Please try again.");
    }
});

// ── Callback query handler (inline keyboards) ───────────────────────
bot.on("callback_query:data", async (ctx) => {
    const userId = ctx.from.id;
    if (!isAllowedUser(userId, config.allowedUserIds)) return;

    const data = ctx.callbackQuery.data;
    console.log(`\n🔘 Callback from ${ctx.from.first_name}: ${data}`);
    await ctx.answerCallbackQuery();

    try {
        const agent = getAgentForUser(userId);
        const response = await agent.handleMessage(`[User clicked button: "${data}"]`);
        await sendResponse(ctx, response, userId);
    } catch (err) {
        console.error(`❌ Error: ${(err as Error).message}`);
    }
});

// ── Text message handler (must be last) ──────────────────────────────
bot.on("message:text", async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || "Unknown";
    const messageText = ctx.message.text;

    // Security: whitelist check
    if (!isAllowedUser(userId, config.allowedUserIds)) {
        console.log(`🚫 Blocked: ${userName} (${userId})`);
        return;
    }

    console.log(`\n💬 ${userName} (${userId}): ${messageText}`);
    await ctx.replyWithChatAction("typing");

    try {
        const agent = getAgentForUser(userId);
        const response = await agent.handleMessage(messageText);
        await sendResponse(ctx, response, userId);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`❌ Error: ${errorMessage}`);
        await ctx.reply("⚠️ Something went wrong processing your message. Please try again.");
    }
});

// ── Utility: split long messages ─────────────────────────────────────
function splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }
        let splitIndex = remaining.lastIndexOf("\n", maxLength);
        if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
            splitIndex = remaining.lastIndexOf(" ", maxLength);
        }
        if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
            splitIndex = maxLength;
        }
        chunks.push(remaining.substring(0, splitIndex));
        remaining = remaining.substring(splitIndex).trimStart();
    }
    return chunks;
}

// ── Error handling ───────────────────────────────────────────────────
bot.catch((err) => {
    console.error("❌ Bot error:", err.message);
});

// ── Graceful shutdown ────────────────────────────────────────────────
function shutdown(signal: string) {
    console.log(`\n🛑 ${signal} — shutting down...`);
    bot.stop();
    closeDatabase();
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ── Memory evolution scheduler (every 24h) ───────────────────────────
setInterval(() => {
    try { evolveMemory(); } catch { }
}, 24 * 60 * 60 * 1000);

// ── Start the bot ────────────────────────────────────────────────────
console.log("\n🤖 Gravity Claw is online! Listening for Telegram messages...");
console.log("   Press Ctrl+C to stop.\n");

bot.start();
