// src/memory/retrieval.ts — Hybrid memory retrieval (vector + FTS5 + graph + episodic)

import { getDatabase, searchFacts, getRecentConversations } from "./sqlite.js";
import { generateEmbedding, isEmbeddingsAvailable } from "./embeddings.js";
import { queryConnections } from "./knowledge_graph.js";

interface RetrievedMemory {
    content: string;
    category: string;
    source: "semantic" | "keyword" | "graph" | "episodic";
    score: number;
}

/**
 * Retrieve relevant context for a user message using hybrid search.
 * Combines vector similarity, FTS5 keyword, knowledge graph, and episodic memories.
 */
export async function retrieveRelevantContext(
    userMessage: string,
    userId?: number,
    maxResults: number = 10
): Promise<string> {
    const allMemories: RetrievedMemory[] = [];

    // 1. Vector semantic search (if embeddings available)
    if (isEmbeddingsAvailable()) {
        try {
            const queryEmbedding = await generateEmbedding(userMessage);
            const vectorResults = vectorSearch(queryEmbedding, Math.ceil(maxResults / 2));
            allMemories.push(
                ...vectorResults.map((r) => ({
                    content: r.content,
                    category: r.category,
                    source: "semantic" as const,
                    score: r.distance ? 1 - r.distance : 0.5, // Convert distance to similarity
                }))
            );
        } catch (err) {
            console.warn(`  ⚠️ Vector search failed: ${(err as Error).message}`);
        }
    }

    // 2. FTS5 keyword search
    try {
        const keywords = extractKeywords(userMessage);
        if (keywords) {
            const ftsResults = searchFacts(keywords, 5);
            allMemories.push(
                ...ftsResults.map((r) => ({
                    content: r.content,
                    category: r.category,
                    source: "keyword" as const,
                    score: r.relevance_score * 0.8, // Slightly lower weight than semantic
                }))
            );
        }
    } catch {
        // FTS5 search failed — continue without it
    }

    // 3. Knowledge graph connections
    try {
        const entities = extractEntityNames(userMessage);
        for (const entity of entities.slice(0, 3)) {
            const connections = queryConnections(entity);
            if (connections.entity) {
                const graphFact = `${connections.entity.name} (${connections.entity.type}): ` +
                    connections.connections
                        .slice(0, 5)
                        .map((c) => `${c.relationship} → ${c.entity.name}`)
                        .join(", ");
                allMemories.push({
                    content: graphFact,
                    category: "graph",
                    source: "graph",
                    score: 0.6,
                });
            }
        }
    } catch {
        // Graph search failed — continue
    }

    // 4. Recent episodic memories (past conversation summaries)
    if (userId) {
        try {
            const episodes = getRecentConversations(userId, 3);
            for (const ep of episodes) {
                allMemories.push({
                    content: `[Past conversation ${ep.created_at}]: ${ep.summary}`,
                    category: "episodic",
                    source: "episodic",
                    score: 0.4,
                });
            }
        } catch {
            // Episodic search failed — continue
        }
    }

    // Deduplicate by content similarity
    const deduplicated = deduplicateMemories(allMemories);

    // Sort by score (highest first) and take top results
    deduplicated.sort((a, b) => b.score - a.score);
    const topResults = deduplicated.slice(0, maxResults);

    if (topResults.length === 0) return "";

    // Format as context block
    return topResults
        .map((m) => `- [${m.category}] ${m.content}`)
        .join("\n");
}

/**
 * Vector similarity search using sqlite-vec.
 */
function vectorSearch(
    queryEmbedding: Float32Array,
    limit: number
): Array<{ content: string; category: string; distance: number }> {
    const db = getDatabase();

    try {
        const rows = db.prepare(`
      SELECT f.content, f.category, v.distance
      FROM facts_vec v
      JOIN facts f ON f.id = v.rowid
      WHERE v.embedding MATCH ? AND k = ?
      ORDER BY v.distance
    `).all(Buffer.from(queryEmbedding.buffer), limit) as Array<{
            content: string;
            category: string;
            distance: number;
        }>;

        return rows;
    } catch (err) {
        console.warn(`  ⚠️ Vector search query failed: ${(err as Error).message}`);
        return [];
    }
}

/**
 * Extract meaningful keywords from a message for FTS5 search.
 */
function extractKeywords(text: string): string {
    const stopWords = new Set([
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "can", "shall", "to", "of", "in", "for",
        "on", "with", "at", "by", "from", "as", "into", "through", "during",
        "before", "after", "about", "between", "under", "above", "up", "down",
        "out", "off", "over", "again", "further", "then", "once", "here",
        "there", "when", "where", "why", "how", "all", "each", "every",
        "both", "few", "more", "most", "other", "some", "such", "no", "nor",
        "not", "only", "own", "same", "so", "than", "too", "very", "just",
        "but", "and", "or", "if", "i", "me", "my", "you", "your", "we",
        "they", "them", "what", "which", "who", "this", "that", "it", "he",
        "she", "him", "her", "its",
    ]);

    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w))
        .slice(0, 8)
        .join(" ");
}

/**
 * Extract potential entity names from a message (capitalized words/phrases).
 */
function extractEntityNames(text: string): string[] {
    const matches = text.match(/[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*/g);
    return matches ? [...new Set(matches)] : [];
}

/**
 * Deduplicate memories with very similar content.
 */
function deduplicateMemories(memories: RetrievedMemory[]): RetrievedMemory[] {
    const seen = new Set<string>();
    return memories.filter((m) => {
        const key = m.content.toLowerCase().substring(0, 100);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
