// src/memory/embeddings.ts — Generate text embeddings via OpenRouter

import OpenAI from "openai";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

let embeddingClient: OpenAI | null = null;

/** Initialize the embedding client (uses the same OpenRouter API key) */
export function initEmbeddings(apiKey: string): void {
    embeddingClient = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
        defaultHeaders: {
            "HTTP-Referer": "https://github.com/gravity-claw",
            "X-Title": "Gravity Claw",
        },
    });
    console.log("✅ Embedding client initialized");
}

// Simple LRU-ish cache for embeddings (avoid re-embedding identical text)
const embeddingCache = new Map<string, Float32Array>();
const MAX_CACHE_SIZE = 500;

function getCacheKey(text: string): string {
    // Use first 200 chars as cache key to keep map small
    return text.substring(0, 200).toLowerCase().trim();
}

/**
 * Generate an embedding vector for a given text.
 * Returns a Float32Array of `EMBEDDING_DIMENSIONS` floats.
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
    if (!embeddingClient) {
        throw new Error("Embedding client not initialized — call initEmbeddings() first");
    }

    // Check cache
    const cacheKey = getCacheKey(text);
    const cached = embeddingCache.get(cacheKey);
    if (cached) return cached;

    // Clean the text
    const cleanText = text.replace(/\n+/g, " ").trim().substring(0, 8000);

    const response = await embeddingClient.embeddings.create({
        model: EMBEDDING_MODEL,
        input: cleanText,
    });

    const vector = new Float32Array(response.data[0].embedding);

    // Cache it
    if (embeddingCache.size >= MAX_CACHE_SIZE) {
        // Remove oldest entry
        const firstKey = embeddingCache.keys().next().value;
        if (firstKey) embeddingCache.delete(firstKey);
    }
    embeddingCache.set(cacheKey, vector);

    return vector;
}

/**
 * Generate embeddings for multiple texts in a batch.
 */
export async function generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
    if (!embeddingClient) {
        throw new Error("Embedding client not initialized");
    }

    const cleanTexts = texts.map((t) => t.replace(/\n+/g, " ").trim().substring(0, 8000));

    const response = await embeddingClient.embeddings.create({
        model: EMBEDDING_MODEL,
        input: cleanTexts,
    });

    return response.data.map((d) => new Float32Array(d.embedding));
}

export function isEmbeddingsAvailable(): boolean {
    return embeddingClient !== null;
}

export { EMBEDDING_DIMENSIONS };
