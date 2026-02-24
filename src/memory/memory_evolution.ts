// src/memory/memory_evolution.ts — Self-evolving memory system

import { getDatabase } from "./sqlite.js";

/**
 * Decay memory relevance scores based on time since last access.
 * Memories accessed frequently maintain high scores.
 * Memories never accessed gradually decay toward 0.
 */
export function decayMemories(): number {
    const db = getDatabase();

    // Decay factor: reduce score by 5% for each day since last update
    // But boost score based on access_count
    const result = db.prepare(`
    UPDATE facts
    SET relevance_score = MAX(0.1,
      relevance_score * POWER(0.95, julianday('now') - julianday(updated_at))
      + (access_count * 0.02)
    )
    WHERE relevance_score > 0.1
  `).run();

    return result.changes;
}

/**
 * Find and merge near-duplicate facts.
 * Uses FTS5 to find facts with very similar content.
 */
export function findDuplicates(): Array<{ id1: number; id2: number; content1: string; content2: string }> {
    const db = getDatabase();
    const facts = db.prepare("SELECT id, content FROM facts ORDER BY id").all() as Array<{ id: number; content: string }>;
    const duplicates: Array<{ id1: number; id2: number; content1: string; content2: string }> = [];

    for (let i = 0; i < facts.length; i++) {
        for (let j = i + 1; j < facts.length; j++) {
            const similarity = computeSimilarity(facts[i].content, facts[j].content);
            if (similarity > 0.8) {
                duplicates.push({
                    id1: facts[i].id,
                    id2: facts[j].id,
                    content1: facts[i].content,
                    content2: facts[j].content,
                });
            }
        }
    }

    return duplicates;
}

/** Simple Jaccard similarity between two strings */
function computeSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));

    let intersection = 0;
    for (const word of wordsA) {
        if (wordsB.has(word)) intersection++;
    }

    const union = wordsA.size + wordsB.size - intersection;
    return union > 0 ? intersection / union : 0;
}

/**
 * Merge duplicate facts — keep the one with higher access count,
 * combine content if different enough.
 */
export function mergeDuplicates(): number {
    const db = getDatabase();
    const duplicates = findDuplicates();
    let merged = 0;

    for (const dup of duplicates) {
        // Get full records
        const fact1 = db.prepare("SELECT * FROM facts WHERE id = ?").get(dup.id1) as { id: number; access_count: number; content: string } | undefined;
        const fact2 = db.prepare("SELECT * FROM facts WHERE id = ?").get(dup.id2) as { id: number; access_count: number; content: string } | undefined;

        if (!fact1 || !fact2) continue;

        // Keep the one with higher access count
        const keep = fact1.access_count >= fact2.access_count ? fact1 : fact2;
        const remove = keep === fact1 ? fact2 : fact1;

        // Transfer access count
        db.prepare("UPDATE facts SET access_count = access_count + ? WHERE id = ?").run(remove.access_count, keep.id);
        db.prepare("DELETE FROM facts WHERE id = ?").run(remove.id);
        merged++;
    }

    return merged;
}

/**
 * Prune expired low-relevance facts.
 * Removes facts with very low relevance scores that haven't been accessed.
 */
export function pruneExpiredFacts(minScore: number = 0.15): number {
    const db = getDatabase();
    const result = db.prepare("DELETE FROM facts WHERE relevance_score < ? AND access_count = 0").run(minScore);
    return result.changes;
}

/**
 * Run full memory evolution cycle.
 * Call on startup and periodically.
 */
export function evolveMemory(): { decayed: number; merged: number; pruned: number } {
    const decayed = decayMemories();
    const merged = mergeDuplicates();
    const pruned = pruneExpiredFacts();

    if (decayed > 0 || merged > 0 || pruned > 0) {
        console.log(`🧬 Memory evolution: ${decayed} decayed, ${merged} merged, ${pruned} pruned`);
    }

    return { decayed, merged, pruned };
}
