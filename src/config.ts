// src/config.ts — Environment configuration with validation

import "dotenv/config";

export interface Config {
    telegramToken: string;
    openRouterApiKey: string;
    allowedUserIds: number[];
    // Optional keys — features degrade gracefully when missing
    groqApiKey: string | null;
    elevenLabsApiKey: string | null;
    elevenLabsVoiceId: string;
    // New Features
    masterKey: string | null;
    sandboxEnabled: boolean;
    sandboxImage: string | null;
    gmailClientId: string | null;
    gmailClientSecret: string | null;
    gmailRefreshToken: string | null;
    briefingTime: string;
    canvasPort: number;
}

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`❌ Missing required environment variable: ${key}\n   → Copy .env.example to .env and fill in your values.`);
    }
    return value;
}

function optionalEnv(key: string): string | null {
    return process.env[key] || null;
}

function parseUserIds(raw: string): number[] {
    return raw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
        .map((id) => {
            const num = parseInt(id, 10);
            if (isNaN(num)) {
                throw new Error(`❌ Invalid user ID in ALLOWED_USER_IDS: "${id}" — must be a number.`);
            }
            return num;
        });
}

export function loadConfig(): Config {
    const telegramToken = requireEnv("TELEGRAM_BOT_TOKEN");
    const openRouterApiKey = requireEnv("OPENROUTER_API_KEY");
    const allowedUserIdsRaw = requireEnv("ALLOWED_USER_IDS");
    const allowedUserIds = parseUserIds(allowedUserIdsRaw);

    if (allowedUserIds.length === 0) {
        throw new Error("❌ ALLOWED_USER_IDS is empty — add at least one Telegram user ID.");
    }

    const groqApiKey = optionalEnv("GROQ_API_KEY");
    const elevenLabsApiKey = optionalEnv("ELEVENLABS_API_KEY");
    const elevenLabsVoiceId = optionalEnv("ELEVENLABS_VOICE_ID") || "21m00Tcm4TlvDq8ikWAM";

    // New Features
    const masterKey = optionalEnv("MASTER_KEY");
    const sandboxEnabled = optionalEnv("SANDBOX_ENABLED") === "true";
    const sandboxImage = optionalEnv("SANDBOX_IMAGE");
    const gmailClientId = optionalEnv("GMAIL_CLIENT_ID");
    const gmailClientSecret = optionalEnv("GMAIL_CLIENT_SECRET");
    const gmailRefreshToken = optionalEnv("GMAIL_REFRESH_TOKEN");
    const briefingTime = optionalEnv("BRIEFING_TIME") || "07:00";
    const canvasPortRaw = optionalEnv("CANVAS_PORT");
    const canvasPort = canvasPortRaw ? parseInt(canvasPortRaw, 10) : 3001;

    console.log(`✅ Config loaded — ${allowedUserIds.length} allowed user(s)`);
    if (groqApiKey) console.log("  🎙️ Groq Whisper transcription: enabled");
    else console.log("  🎙️ Groq transcription: disabled (set GROQ_API_KEY)");
    if (elevenLabsApiKey) console.log("  🗣️ ElevenLabs TTS: enabled");
    else console.log("  🗣️ ElevenLabs TTS: disabled (set ELEVENLABS_API_KEY)");

    return {
        telegramToken,
        openRouterApiKey,
        allowedUserIds,
        groqApiKey,
        elevenLabsApiKey,
        elevenLabsVoiceId,
        masterKey,
        sandboxEnabled,
        sandboxImage,
        gmailClientId,
        gmailClientSecret,
        gmailRefreshToken,
        briefingTime,
        canvasPort,
    };
}
