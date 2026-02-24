// src/tools/registry.ts — Central tool registry

import type { RegisteredTool, ToolDefinition } from "../types.js";

// ── Import all tools ─────────────────────────────────────────────────
import { getCurrentTime } from "./get_current_time.js";
import { runShellCommand } from "./shell.js";
import { readFileTool, writeFileTool, listDirectoryTool, deleteFileTool } from "./files.js";
import { webSearch } from "./web_search.js";
import { rememberFact, recallFacts, listMemories, forgetFact } from "./memory_tools.js";
import { addEntityTool, addRelationshipTool, queryGraphTool } from "./graph_tools.js";
import { saveNoteTool, readNoteTool, listNotesTool, deleteNoteTool } from "./note_tools.js";
import { scheduleTaskTool, listScheduledTasksTool, deleteScheduledTaskTool } from "./scheduler_tools.js";

// New features
import { storeSecretTool, getSecretTool, listSecretsTool } from "./secret_tools.js";
import { listEmailsTool, readEmailTool, sendEmailTool, replyEmailTool } from "./gmail_tools.js";
import { createChartTool, createTableTool, createFormTool, pushHtmlTool, clearCanvasTool } from "./canvas_tools.js";
import { listCalendarEventsTool, createCalendarEventTool, deleteCalendarEventTool } from "./calendar_tools.js";
import { searchDriveFilesTool, listDriveFilesTool, readDriveFileTool } from "./drive_tools.js";

/** Map of tool name → registered tool */
const tools = new Map<string, RegisteredTool>();

/** Register a tool */
export function register(tool: RegisteredTool): void {
    const name = tool.definition.function.name;
    if (tools.has(name)) {
        throw new Error(`Tool "${name}" is already registered.`);
    }
    tools.set(name, tool);
}

/** Execute a tool by name with given input */
export async function executeTool(
    name: string,
    input: Record<string, unknown>
): Promise<string> {
    const tool = tools.get(name);
    if (!tool) {
        return JSON.stringify({ error: `Unknown tool: "${name}"` });
    }

    try {
        return await tool.handler(input);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: `Tool "${name}" failed: ${message}` });
    }
}

/** Get all tool definitions (OpenAI function-calling format) */
export function getToolDefinitions(): ToolDefinition[] {
    return Array.from(tools.values()).map((t) => t.definition);
}

/** Get list of registered tool names */
export function getToolNames(): string[] {
    return Array.from(tools.keys());
}

// ── Register all static tools ────────────────────────────────────────

// Core
register(getCurrentTime);

// System tools
register(runShellCommand);
register(readFileTool);
register(writeFileTool);
register(listDirectoryTool);
register(deleteFileTool);

// Web
register(webSearch);

// Memory
register(rememberFact);
register(recallFacts);
register(listMemories);
register(forgetFact);

// Knowledge graph
register(addEntityTool);
register(addRelationshipTool);
register(queryGraphTool);

// Notes
register(saveNoteTool);
register(readNoteTool);
register(listNotesTool);
register(deleteNoteTool);

// Scheduler
register(scheduleTaskTool);
register(listScheduledTasksTool);
register(deleteScheduledTaskTool);

// Secrets
register(storeSecretTool);
register(getSecretTool);
register(listSecretsTool);

// Gmail
register(listEmailsTool);
register(readEmailTool);
register(sendEmailTool);
register(replyEmailTool);

// Canvas
register(createChartTool);
register(createTableTool);
register(createFormTool);
register(pushHtmlTool);
register(clearCanvasTool);

// Calendar
register(listCalendarEventsTool);
register(createCalendarEventTool);
register(deleteCalendarEventTool);

// Drive
register(searchDriveFilesTool);
register(listDriveFilesTool);
register(readDriveFileTool);

console.log(`✅ Tool registry loaded — ${tools.size} static tool(s) initially`);
