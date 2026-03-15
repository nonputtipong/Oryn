// src/memory/extraction.ts — LLM-powered fact extraction and memory consolidation

import OpenAI from "openai";
import { storeFact, searchFacts, deleteFact, getDatabase } from "./sqlite.js";
import { generateEmbedding, isEmbeddingsAvailable } from "./embeddings.js";
import { addEntity, addRelationship } from "./knowledge_graph.js";

interface ExtractedFact {
    content: string;
    category: string;
    entities?: string[];
}

interface ConsolidationDecision {
    action: "ADD" | "UPDATE" | "DELETE" | "NOOP";
    existing_id?: number;
    reason: string;
}

let extractionClient: OpenAI | null = null;
let extractionModel: string = "google/gemini-2.0-flash-001";

export function initExtraction(apiKey: string, model?: string): void {
    extractionClient = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
        defaultHeaders: {
            "HTTP-Referer": "https://github.com/oryn",
            "X-Title": "Oryn",
        },
    });
    if (model) extractionModel = model;
    console.log("✅ Memory extraction pipeline initialized");
}

/**
 * Phase 1: Extract facts from a user-bot exchange.
 * Uses the LLM to identify salient information worth remembering.
 */
export async function extractFacts(
    userMessage: string,
    botResponse: string
): Promise<ExtractedFact[]> {
    if (!extractionClient) return [];

    try {
        const response = await extractionClient.chat.completions.create({
            model: extractionModel,
            max_tokens: 1024,
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: `You are a memory extraction system. Given a user-bot exchange, extract key facts worth remembering long-term.

Rules:
- Only extract genuinely useful information (preferences, personal facts, decisions, names, dates, goals, opinions)
- Skip greetings, small talk, and transient questions
- Each fact should be a concise, standalone statement
- Category must be one of: preference, fact, person, project, goal, opinion, event, general
- Include entity names mentioned (people, places, projects, tools)
- Return valid JSON array. Return [] if nothing worth remembering.

Format: [{"content": "...", "category": "...", "entities": ["..."]}]`,
                },
                {
                    role: "user",
                    content: `User: ${userMessage}\n\nBot: ${botResponse}`,
                },
            ],
        });

        const text = response.choices[0]?.message?.content || "[]";
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const parsed = JSON.parse(jsonMatch[0]);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.warn(`  ⚠️ Fact extraction failed: ${(err as Error).message}`);
        return [];
    }
}

/**
 * Phase 2: Consolidate extracted facts against existing memory.
 * For each fact, search for similar existing memories and decide: ADD/UPDATE/DELETE/NOOP.
 */
export async function consolidateMemory(facts: ExtractedFact[]): Promise<void> {
    if (!extractionClient || facts.length === 0) return;

    for (const fact of facts) {
        try {
            // Search for similar existing memories
            const existingMemories = searchFacts(fact.content, 5);

            if (existingMemories.length === 0) {
                // No similar memories — just ADD
                const factId = storeFact(fact.content, fact.category);
                await storeFactEmbedding(factId, fact.content);

                // Auto-populate knowledge graph with entities
                if (fact.entities && fact.entities.length > 0) {
                    for (const entity of fact.entities) {
                        addEntity(entity, "auto-extracted");
                    }
                    // Create relationships between entities if multiple
                    if (fact.entities.length >= 2) {
                        for (let i = 0; i < fact.entities.length - 1; i++) {
                            addRelationship(fact.entities[i], fact.entities[i + 1], "mentioned_with");
                        }
                    }
                }

                console.log(`  💾 Memory ADD: "${fact.content}" [${fact.category}]`);
                continue;
            }

            // Ask LLM to decide what to do
            const decision = await decideConsolidation(fact, existingMemories);

            switch (decision.action) {
                case "ADD":
                    const newId = storeFact(fact.content, fact.category);
                    await storeFactEmbedding(newId, fact.content);
                    console.log(`  💾 Memory ADD: "${fact.content}"`);
                    break;

                case "UPDATE":
                    if (decision.existing_id) {
                        const db = getDatabase();
                        db.prepare("UPDATE facts SET content = ?, category = ?, updated_at = datetime('now') WHERE id = ?")
                            .run(fact.content, fact.category, decision.existing_id);
                        await storeFactEmbedding(decision.existing_id, fact.content);
                        console.log(`  🔄 Memory UPDATE #${decision.existing_id}: "${fact.content}"`);
                    }
                    break;

                case "DELETE":
                    if (decision.existing_id) {
                        deleteFact(decision.existing_id);
                        console.log(`  🗑️ Memory DELETE #${decision.existing_id}: ${decision.reason}`);
                    }
                    break;

                case "NOOP":
                    // Already known, do nothing
                    break;
            }
        } catch (err) {
            console.warn(`  ⚠️ Consolidation failed for "${fact.content}": ${(err as Error).message}`);
        }
    }
}

/**
 * Ask the LLM to decide how to consolidate a new fact with existing memories.
 */
async function decideConsolidation(
    newFact: ExtractedFact,
    existingMemories: Array<{ id: number; content: string; category: string }>
): Promise<ConsolidationDecision> {
    if (!extractionClient) return { action: "ADD", reason: "No extraction client" };

    try {
        const existingList = existingMemories
            .map((m) => `  [ID ${m.id}] "${m.content}" (${m.category})`)
            .join("\n");

        const response = await extractionClient.chat.completions.create({
            model: extractionModel,
            max_tokens: 256,
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: `You are a memory consolidation system. Given a new fact and existing memories, decide the action.

Actions:
- ADD: New information not covered by existing memories
- UPDATE: Existing memory needs to be updated with new info (return existing_id)
- DELETE: New info contradicts/invalidates an existing memory (return existing_id)
- NOOP: Information already known, no change needed

Return valid JSON: {"action": "ADD|UPDATE|DELETE|NOOP", "existing_id": <number or null>, "reason": "brief reason"}`,
                },
                {
                    role: "user",
                    content: `New fact: "${newFact.content}" (${newFact.category})\n\nExisting memories:\n${existingList}`,
                },
            ],
        });

        const text = response.choices[0]?.message?.content || '{"action":"ADD","reason":"default"}';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { action: "ADD", reason: "parse failed" };

        return JSON.parse(jsonMatch[0]);
    } catch {
        return { action: "ADD", reason: "consolidation LLM call failed" };
    }
}

/**
 * Store a vector embedding for a fact.
 */
async function storeFactEmbedding(factId: number, content: string): Promise<void> {
    if (!isEmbeddingsAvailable()) return;

    try {
        const embedding = await generateEmbedding(content);
        const db = getDatabase();
        db.prepare("INSERT OR REPLACE INTO facts_vec (rowid, embedding) VALUES (?, ?)").run(
            factId,
            Buffer.from(embedding.buffer)
        );
    } catch (err) {
        console.warn(`  ⚠️ Embedding storage failed: ${(err as Error).message}`);
    }
}

/**
 * Run the full extraction + consolidation pipeline for an exchange.
 * Called asynchronously after each user↔bot exchange.
 */
export async function processExchange(
    userMessage: string,
    botResponse: string
): Promise<void> {
    const facts = await extractFacts(userMessage, botResponse);
    if (facts.length > 0) {
        console.log(`  🧠 Extracted ${facts.length} fact(s) from exchange`);
        await consolidateMemory(facts);
    }
}
