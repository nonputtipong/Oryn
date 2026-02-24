// src/types.ts — Shared type definitions

import type OpenAI from "openai";

/** Definition of a tool that the agent can call (OpenAI function-calling format) */
export interface ToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

/** Handler function for a tool — receives input, returns string result */
export type ToolHandler = (input: Record<string, unknown>) => Promise<string>;

/** A registered tool: its definition + handler */
export interface RegisteredTool {
    definition: ToolDefinition;
    handler: ToolHandler;
}

/** Message in the conversation history */
export type ConversationMessage = OpenAI.Chat.ChatCompletionMessageParam;
