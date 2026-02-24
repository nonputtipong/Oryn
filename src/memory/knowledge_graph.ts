// src/memory/knowledge_graph.ts — Knowledge graph with entities and relationships

import { getDatabase } from "./sqlite.js";

export interface Entity {
    id: number;
    name: string;
    type: string;
    properties: Record<string, unknown>;
    created_at: string;
}

export interface Relationship {
    id: number;
    from_entity_id: number;
    to_entity_id: number;
    type: string;
    properties: Record<string, unknown>;
    created_at: string;
}

export function addEntity(name: string, type: string = "thing", properties: Record<string, unknown> = {}): number {
    const db = getDatabase();
    try {
        const result = db.prepare(
            "INSERT INTO entities (name, type, properties) VALUES (?, ?, ?)"
        ).run(name, type, JSON.stringify(properties));
        return result.lastInsertRowid as number;
    } catch (err) {
        // If entity already exists, update it
        if ((err as Error).message.includes("UNIQUE")) {
            db.prepare(
                "UPDATE entities SET type = ?, properties = ? WHERE name = ?"
            ).run(type, JSON.stringify(properties), name);
            const existing = db.prepare("SELECT id FROM entities WHERE name = ?").get(name) as { id: number };
            return existing.id;
        }
        throw err;
    }
}

export function addRelationship(
    fromEntityName: string,
    toEntityName: string,
    relType: string,
    properties: Record<string, unknown> = {}
): number {
    const db = getDatabase();

    // Get or create entities
    const fromId = addEntity(fromEntityName);
    const toId = addEntity(toEntityName);

    const result = db.prepare(
        "INSERT INTO relationships (from_entity_id, to_entity_id, type, properties) VALUES (?, ?, ?, ?)"
    ).run(fromId, toId, relType, JSON.stringify(properties));

    return result.lastInsertRowid as number;
}

export function queryConnections(entityName: string): {
    entity: Entity | null;
    connections: Array<{ relationship: string; direction: string; entity: Entity }>;
} {
    const db = getDatabase();

    const entity = db.prepare("SELECT * FROM entities WHERE name = ?").get(entityName) as Entity | undefined;
    if (!entity) return { entity: null, connections: [] };

    entity.properties = JSON.parse(entity.properties as unknown as string);

    // Get outgoing relationships
    const outgoing = db.prepare(`
    SELECT r.type as rel_type, e.id, e.name, e.type, e.properties, e.created_at
    FROM relationships r
    JOIN entities e ON e.id = r.to_entity_id
    WHERE r.from_entity_id = ?
  `).all(entity.id) as Array<{ rel_type: string; id: number; name: string; type: string; properties: string; created_at: string }>;

    // Get incoming relationships
    const incoming = db.prepare(`
    SELECT r.type as rel_type, e.id, e.name, e.type, e.properties, e.created_at
    FROM relationships r
    JOIN entities e ON e.id = r.from_entity_id
    WHERE r.to_entity_id = ?
  `).all(entity.id) as Array<{ rel_type: string; id: number; name: string; type: string; properties: string; created_at: string }>;

    const connections = [
        ...outgoing.map((r) => ({
            relationship: r.rel_type,
            direction: "outgoing" as const,
            entity: { id: r.id, name: r.name, type: r.type, properties: JSON.parse(r.properties), created_at: r.created_at },
        })),
        ...incoming.map((r) => ({
            relationship: r.rel_type,
            direction: "incoming" as const,
            entity: { id: r.id, name: r.name, type: r.type, properties: JSON.parse(r.properties), created_at: r.created_at },
        })),
    ];

    return { entity, connections };
}

export function getAllEntities(limit: number = 50): Entity[] {
    const db = getDatabase();
    const entities = db.prepare("SELECT * FROM entities ORDER BY created_at DESC LIMIT ?").all(limit) as Entity[];
    return entities.map((e) => ({ ...e, properties: JSON.parse(e.properties as unknown as string) }));
}
