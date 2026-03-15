// src/mcp/mcp_bridge.ts — MCP client bridge: connect to external MCP servers

import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import { execFile, ChildProcess, spawn } from "child_process";
import type { ToolDefinition, RegisteredTool } from "../types.js";

interface MCPServerConfig {
    command?: string;
    args?: string[];
    serverUrl?: string;
    env?: Record<string, string>;
}

interface MCPServerConfigs {
    mcpServers: Record<string, MCPServerConfig>;
}

interface MCPToolInfo {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    serverName: string;
}

interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: number;
    method: string;
    params?: Record<string, unknown>;
}

interface JsonRpcResponse {
    jsonrpc: "2.0";
    id: number;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

// Active MCP server connections
const activeServers = new Map<string, {
    process?: ChildProcess;
    type: "stdio" | "sse";
    config: MCPServerConfig;
    tools: MCPToolInfo[];
    nextId: number;
    pendingRequests: Map<number, {
        resolve: (value: JsonRpcResponse) => void;
        reject: (reason: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
    }>;
    buffer: string;
}>();

const CONFIG_PATH = resolve(process.cwd(), "mcp_servers.json");
const REQUEST_TIMEOUT = 30000;

/**
 * Initialize MCP bridge — load configs and connect to servers.
 */
export async function initMCPBridge(): Promise<void> {
    if (!existsSync(CONFIG_PATH)) {
        console.log("  ℹ️ No mcp_servers.json found — MCP bridge skipped");
        return;
    }

    let configs: MCPServerConfigs;
    try {
        configs = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    } catch (err) {
        console.warn(`  ⚠️ Failed to parse mcp_servers.json: ${(err as Error).message}`);
        return;
    }

    if (!configs.mcpServers) return;

    for (const [name, config] of Object.entries(configs.mcpServers)) {
        try {
            if (config.command) {
                await connectStdio(name, config);
            } else if (config.serverUrl) {
                // SSE servers are tracked but connected on-demand
                activeServers.set(name, {
                    type: "sse",
                    config,
                    tools: [],
                    nextId: 1,
                    pendingRequests: new Map(),
                    buffer: "",
                });
                console.log(`  🔌 MCP server registered (SSE): ${name}`);
            }
        } catch (err) {
            console.warn(`  ⚠️ Failed to connect MCP server '${name}': ${(err as Error).message}`);
        }
    }
}

/**
 * Connect to an MCP server via stdio (spawn process).
 */
async function connectStdio(name: string, config: MCPServerConfig): Promise<void> {
    const proc = spawn(config.command!, config.args || [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...config.env },
    });

    const server = {
        process: proc,
        type: "stdio" as const,
        config,
        tools: [] as MCPToolInfo[],
        nextId: 1,
        pendingRequests: new Map<number, {
            resolve: (value: JsonRpcResponse) => void;
            reject: (reason: Error) => void;
            timeout: ReturnType<typeof setTimeout>;
        }>(),
        buffer: "",
    };

    activeServers.set(name, server);

    // Handle stdout data (JSON-RPC responses)
    proc.stdout!.on("data", (chunk: Buffer) => {
        server.buffer += chunk.toString();
        processBuffer(name);
    });

    proc.stderr!.on("data", (chunk: Buffer) => {
        console.warn(`  MCP ${name} stderr: ${chunk.toString().trim()}`);
    });

    proc.on("exit", (code) => {
        console.warn(`  ⚠️ MCP server '${name}' exited (code ${code})`);
        activeServers.delete(name);
    });

    // Initialize the connection
    try {
        await sendRequest(name, "initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "oryn", version: "0.2.0" },
        });
        // Send initialized notification
        sendNotification(name, "notifications/initialized", {});
        console.log(`  🔌 MCP server connected (stdio): ${name}`);

        // List available tools
        const toolsResult = await sendRequest(name, "tools/list", {});
        if (toolsResult.result && Array.isArray((toolsResult.result as any).tools)) {
            server.tools = (toolsResult.result as any).tools.map((t: any) => ({
                name: t.name,
                description: t.description || "",
                inputSchema: t.inputSchema || { type: "object", properties: {} },
                serverName: name,
            }));
            console.log(`  📦 MCP ${name}: ${server.tools.length} tool(s) discovered`);
        }
    } catch (err) {
        console.warn(`  ⚠️ MCP ${name} init failed: ${(err as Error).message}`);
    }
}

/**
 * Process buffered JSON-RPC messages from stdout.
 */
function processBuffer(serverName: string): void {
    const server = activeServers.get(serverName);
    if (!server) return;

    // Try to parse complete JSON objects from buffer
    const lines = server.buffer.split("\n");
    server.buffer = "";

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
            const msg = JSON.parse(trimmed) as JsonRpcResponse;
            if (msg.id !== undefined) {
                const pending = server.pendingRequests.get(msg.id);
                if (pending) {
                    clearTimeout(pending.timeout);
                    server.pendingRequests.delete(msg.id);
                    pending.resolve(msg);
                }
            }
        } catch {
            // Incomplete JSON — put it back in buffer
            server.buffer += trimmed;
        }
    }
}

/**
 * Send a JSON-RPC request to an MCP server.
 */
function sendRequest(serverName: string, method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    const server = activeServers.get(serverName);
    if (!server || !server.process) {
        return Promise.reject(new Error(`MCP server '${serverName}' not connected`));
    }

    return new Promise((resolve, reject) => {
        const id = server.nextId++;
        const request: JsonRpcRequest = {
            jsonrpc: "2.0",
            id,
            method,
            params,
        };

        const timeout = setTimeout(() => {
            server.pendingRequests.delete(id);
            reject(new Error(`MCP request timed out: ${method}`));
        }, REQUEST_TIMEOUT);

        server.pendingRequests.set(id, { resolve, reject, timeout });
        server.process!.stdin!.write(JSON.stringify(request) + "\n");
    });
}

/**
 * Send a JSON-RPC notification (no response expected).
 */
function sendNotification(serverName: string, method: string, params: Record<string, unknown>): void {
    const server = activeServers.get(serverName);
    if (!server || !server.process) return;

    const notification = {
        jsonrpc: "2.0",
        method,
        params,
    };
    server.process.stdin!.write(JSON.stringify(notification) + "\n");
}

/**
 * Call a tool on an MCP server.
 */
export async function callMCPTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
): Promise<string> {
    const server = activeServers.get(serverName);
    if (!server) return JSON.stringify({ error: `MCP server '${serverName}' not connected` });

    if (server.type === "sse") {
        return JSON.stringify({ error: `SSE MCP servers not yet supported for tool calls` });
    }

    try {
        const response = await sendRequest(serverName, "tools/call", {
            name: toolName,
            arguments: args,
        });

        if (response.error) {
            return JSON.stringify({ error: response.error.message });
        }

        // Extract text content from MCP response
        const result = response.result as any;
        if (result?.content && Array.isArray(result.content)) {
            return result.content
                .map((c: any) => c.text || JSON.stringify(c))
                .join("\n");
        }

        return JSON.stringify(result);
    } catch (err) {
        return JSON.stringify({ error: (err as Error).message });
    }
}

/**
 * Get all discovered MCP tools as RegisteredTools for the agent.
 */
export function getMCPTools(): RegisteredTool[] {
    const tools: RegisteredTool[] = [];

    for (const [serverName, server] of activeServers) {
        for (const tool of server.tools) {
            tools.push({
                definition: {
                    type: "function",
                    function: {
                        name: `mcp_${serverName}_${tool.name}`,
                        description: `[MCP: ${serverName}] ${tool.description}`,
                        parameters: tool.inputSchema as any,
                    },
                },
                handler: async (input: Record<string, unknown>): Promise<string> => {
                    return callMCPTool(serverName, tool.name, input);
                },
            });
        }
    }

    return tools;
}

/**
 * Get list of connected MCP servers and their tools.
 */
export function getMCPStatus(): Array<{ name: string; type: string; tools: string[] }> {
    const status: Array<{ name: string; type: string; tools: string[] }> = [];
    for (const [name, server] of activeServers) {
        status.push({
            name,
            type: server.type,
            tools: server.tools.map((t) => t.name),
        });
    }
    return status;
}

/**
 * Disconnect all MCP servers gracefully.
 */
export function disconnectAllMCP(): void {
    for (const [name, server] of activeServers) {
        if (server.process) {
            server.process.kill();
            console.log(`  🔌 MCP server disconnected: ${name}`);
        }
    }
    activeServers.clear();
}
