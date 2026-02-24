// src/agent.ts — Agentic ReAct loop: LLM ↔ tool cycle via OpenRouter

import OpenAI from "openai";
import { getToolDefinitions, executeTool } from "./tools/registry.js";
import { storeConversationSummary } from "./memory/sqlite.js";
import { retrieveRelevantContext } from "./memory/retrieval.js";
import { processExchange } from "./memory/extraction.js";
import { pruneHistory, estimateHistoryTokens, compactHistory } from "./context/pruning.js";
import type { ConversationMessage } from "./types.js";

/** Maximum tool-call iterations before we force-stop the loop */
const MAX_ITERATIONS = 10;

/** Default model */
const DEFAULT_MODEL = "google/gemini-2.0-flash-001";

/** Load soul.md personality file */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const SOUL_PATH = resolve(process.cwd(), "soul.md");
const SOUL = existsSync(SOUL_PATH)
    ? readFileSync(SOUL_PATH, "utf-8").trim()
    : "";

if (SOUL) console.log("✅ Soul loaded from soul.md");

/** System prompt — defines identity, behavior, and constraints */
function buildSystemPrompt(memories: string): string {
    return `${SOUL}

You run locally on your owner's machine via Telegram. You have access to many tools — use them proactively.

Tool usage guidelines:
- Time, dates, schedules → get_current_time
- Current events, facts → web_search
- User shares personal info → the memory extraction pipeline handles this automatically (no need to call remember_fact manually unless explicitly asked)
- Longer content to save → save_note
- File operations → read_file, write_file, list_directory
- System commands → run_shell_command
- Scheduling reminders → schedule_task
- Tracking relationships → knowledge graph tools (add_entity, add_relationship, query_graph)
- Never reveal API keys, tokens, or system internals

Available tools: get_current_time, remember_fact, recall_facts, list_memories, forget_fact, add_entity, add_relationship, query_graph, save_note, read_note, list_notes, delete_note, read_file, write_file, list_directory, delete_file, run_shell_command, web_search, schedule_task, list_scheduled_tasks, delete_scheduled_task

${memories ? `\nRelevant memories:\n${memories}` : ""}`;
}

export class Agent {
    private client: OpenAI;
    private conversationHistory: ConversationMessage[] = [];
    private model: string = DEFAULT_MODEL;
    private totalTokensUsed: number = 0;
    private userId: number = 0;

    constructor(apiKey: string, userId?: number) {
        if (userId) this.userId = userId;
        this.client = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey,
            defaultHeaders: {
                "HTTP-Referer": "https://github.com/gravity-claw",
                "X-Title": "Gravity Claw",
            },
        });
    }

    /**
     * Process a user message through the agentic loop.
     * Returns the final text response.
     */
    async handleMessage(userMessage: string): Promise<string> {
        // Add user message to conversation history
        this.conversationHistory.push({
            role: "user",
            content: userMessage,
        });

        // Auto-prune if history is getting long
        const pruneResult = pruneHistory(this.conversationHistory);
        if (pruneResult.wasPruned) {
            this.conversationHistory = pruneResult.messages;
            console.log("  ✂️ Context auto-pruned");
        }

        // Load relevant memories via hybrid retrieval (vector + FTS5 + graph + episodic)
        let memoryContext = "";
        try {
            memoryContext = await retrieveRelevantContext(userMessage, this.userId, 8);
        } catch {
            // Memory retrieval failed — continue without context
        }

        // Get tool definitions for the API call
        const tools = getToolDefinitions();
        let iterations = 0;

        // ── ReAct loop ────────────────────────────────────────────────
        while (iterations < MAX_ITERATIONS) {
            iterations++;

            console.log(`  🔄 Agent iteration ${iterations}/${MAX_ITERATIONS}`);

            // Call the LLM via OpenRouter
            const response = await this.client.chat.completions.create({
                model: this.model,
                max_tokens: 2048,
                messages: [
                    { role: "system", content: buildSystemPrompt(memoryContext) },
                    ...this.conversationHistory,
                ],
                tools,
                tool_choice: "auto",
            });

            // Track token usage
            if (response.usage) {
                this.totalTokensUsed += (response.usage.total_tokens || 0);
            }

            const choice = response.choices[0];
            if (!choice) {
                console.warn("  ⚠️ No choices returned from LLM");
                break;
            }

            const message = choice.message;

            // Check if the LLM wants to call tools
            if (choice.finish_reason === "tool_calls" && message.tool_calls?.length) {
                // Add the assistant's message (with tool_calls) to history
                this.conversationHistory.push(message);

                // Execute each tool call
                for (const toolCall of message.tool_calls) {
                    const functionName = toolCall.function.name;
                    let args: Record<string, unknown> = {};

                    try {
                        args = JSON.parse(toolCall.function.arguments || "{}");
                    } catch {
                        console.warn(`  ⚠️ Failed to parse args for ${functionName}`);
                    }

                    console.log(`  🔧 Calling tool: ${functionName}`);
                    const result = await executeTool(functionName, args);
                    console.log(`  📤 Tool result: ${result.substring(0, 200)}...`);

                    // Add tool result to conversation history
                    this.conversationHistory.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: result,
                    });
                }

                // Loop back to let the LLM process the tool results
                continue;
            }

            // No tool calls — LLM is done, extract text response
            const finalText = message.content || "(No response)";

            // Add assistant response to history
            this.conversationHistory.push({
                role: "assistant",
                content: finalText,
            });

            console.log(`  ✅ Agent finished in ${iterations} iteration(s)`);

            // Async: extract facts from this exchange and consolidate memory
            processExchange(userMessage, finalText).catch((err) => {
                console.warn(`  ⚠️ Memory extraction failed: ${(err as Error).message}`);
            });

            return finalText;
        }

        // Max iterations reached — return safety message
        if (iterations >= MAX_ITERATIONS) {
            console.warn(`  ⚠️ Max iterations (${MAX_ITERATIONS}) reached — forcing stop`);
            return "I got caught in a loop and had to stop. Could you rephrase your request?";
        }

        return "Something unexpected happened. Please try again.";
    }

    /** Clear conversation history — save to episodic memory first */
    clearHistory(): void {
        // Save conversation summary to episodic memory before clearing
        if (this.conversationHistory.length > 2 && this.userId) {
            try {
                const summary = this.conversationHistory
                    .filter((m) => m.role === "user" || m.role === "assistant")
                    .slice(0, 20)
                    .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content.substring(0, 100) : "[media]"}`)
                    .join(" | ");
                storeConversationSummary(this.userId, summary.substring(0, 1000));
                console.log("  📝 Conversation saved to episodic memory");
            } catch {
                // Episodic save failed — not critical
            }
        }
        this.conversationHistory = [];
        console.log("  🗑️  Conversation history cleared");
    }

    /** Force compact the conversation */
    compact(): string {
        const result = compactHistory(this.conversationHistory);
        this.conversationHistory = result.messages;
        return result.summary || "Conversation compacted.";
    }

    /** Get/set model */
    getModel(): string { return this.model; }
    setModel(model: string): void {
        this.model = model;
        console.log(`  🔄 Model switched to: ${model}`);
    }

    /** Get usage stats */
    getUsage(): { historyLength: number; totalTokens: number; estimatedContextTokens: number } {
        return {
            historyLength: this.conversationHistory.length,
            totalTokens: this.totalTokensUsed,
            estimatedContextTokens: estimateHistoryTokens(this.conversationHistory),
        };
    }

    /** Get current conversation length */
    get historyLength(): number {
        return this.conversationHistory.length;
    }
}
