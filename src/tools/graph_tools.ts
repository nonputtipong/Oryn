// src/tools/graph_tools.ts — Knowledge graph tools for the agent

import { addEntity, addRelationship, queryConnections, getAllEntities } from "../memory/knowledge_graph.js";
import type { RegisteredTool } from "../types.js";

export const addEntityTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "add_entity",
            description: "Add an entity to the knowledge graph. Entities represent people, places, projects, concepts, etc.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Entity name (unique identifier)" },
                    type: { type: "string", description: "Entity type: person, place, project, concept, organization, tool" },
                    properties: { type: "object", description: "Additional properties as key-value pairs" },
                },
                required: ["name"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const id = addEntity(
            input.name as string,
            (input.type as string) || "thing",
            (input.properties as Record<string, unknown>) || {}
        );
        return JSON.stringify({ success: true, id, name: input.name });
    },
};

export const addRelationshipTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "add_relationship",
            description: "Create a relationship between two entities in the knowledge graph. Auto-creates entities if they don't exist.",
            parameters: {
                type: "object",
                properties: {
                    from: { type: "string", description: "Source entity name" },
                    to: { type: "string", description: "Target entity name" },
                    relationship: { type: "string", description: "Relationship type (e.g., 'works_at', 'knows', 'uses', 'part_of')" },
                },
                required: ["from", "to", "relationship"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const id = addRelationship(
            input.from as string,
            input.to as string,
            input.relationship as string
        );
        return JSON.stringify({ success: true, id, from: input.from, to: input.to, relationship: input.relationship });
    },
};

export const queryGraphTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "query_graph",
            description: "Query the knowledge graph for an entity and its connections.",
            parameters: {
                type: "object",
                properties: {
                    entity_name: { type: "string", description: "Name of the entity to look up" },
                },
                required: ["entity_name"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const result = queryConnections(input.entity_name as string);
        if (!result.entity) {
            return JSON.stringify({ found: false, message: `Entity "${input.entity_name}" not found` });
        }
        return JSON.stringify({
            found: true,
            entity: result.entity,
            connections: result.connections,
        });
    },
};
