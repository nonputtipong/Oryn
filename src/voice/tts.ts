// src/voice/tts.ts — Text-to-speech via ElevenLabs API

let elevenLabsApiKey: string | null = null;
let elevenLabsVoiceId: string = "21m00Tcm4TlvDq8ikWAM"; // Default: Rachel

export function initTTS(apiKey: string, voiceId?: string): void {
    elevenLabsApiKey = apiKey;
    if (voiceId) elevenLabsVoiceId = voiceId;
    console.log(`✅ ElevenLabs TTS initialized (voice: ${elevenLabsVoiceId})`);
}

/**
 * Convert text to speech audio buffer.
 * Returns an audio buffer (mp3) ready to send via Telegram.
 */
export async function textToSpeech(text: string): Promise<Buffer> {
    if (!elevenLabsApiKey) {
        throw new Error("ElevenLabs not initialized — set ELEVENLABS_API_KEY in .env");
    }

    // Truncate very long text (ElevenLabs has limits)
    const truncated = text.substring(0, 5000);

    const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`,
        {
            method: "POST",
            headers: {
                "xi-api-key": elevenLabsApiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                text: truncated,
                model_id: "eleven_flash_v2_5",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                },
            }),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs API error ${response.status}: ${error}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

export function isTTSAvailable(): boolean {
    return elevenLabsApiKey !== null;
}
