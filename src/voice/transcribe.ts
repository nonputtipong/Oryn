// src/voice/transcribe.ts — Voice transcription via Groq Whisper API

import OpenAI from "openai";
import { writeFile, unlink } from "fs/promises";
import { resolve } from "path";
import { tmpdir } from "os";
import { createReadStream } from "fs";

let whisperClient: OpenAI | null = null;

export function initWhisper(apiKey: string): void {
    whisperClient = new OpenAI({
        baseURL: "https://api.groq.com/openai/v1",
        apiKey,
    });
    console.log("✅ Groq Whisper transcription initialized");
}

/**
 * Transcribe audio from a URL (Telegram file URL).
 * Downloads the file, sends to Groq Whisper, returns text.
 */
export async function transcribeAudio(fileUrl: string): Promise<string> {
    if (!whisperClient) {
        throw new Error("Whisper not initialized — set GROQ_API_KEY in .env");
    }

    // Download the audio file
    const response = await fetch(fileUrl);
    if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const tempPath = resolve(tmpdir(), `oryn-voice-${Date.now()}.ogg`);

    try {
        await writeFile(tempPath, buffer);

        const file = createReadStream(tempPath);

        const transcription = await whisperClient.audio.transcriptions.create({
            file: file as unknown as File,
            model: "whisper-large-v3",
            language: "en",
        });

        return transcription.text;
    } finally {
        // Clean up temp file
        await unlink(tempPath).catch(() => { });
    }
}

export function isWhisperAvailable(): boolean {
    return whisperClient !== null;
}
