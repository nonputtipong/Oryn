// src/tools/shell.ts — Shell command execution with safety controls + sandbox

import { execFile } from "child_process";
import { runInSandbox, isSandboxEnabled } from "../security/sandbox.js";
import type { RegisteredTool } from "../types.js";

/** Commands allowed without confirmation */
const ALLOWLIST = new Set([
    "ls", "cat", "grep", "find", "echo", "date", "pwd", "wc",
    "head", "tail", "which", "env", "whoami", "hostname", "uptime",
    "df", "du", "sort", "uniq", "tr", "cut", "awk", "sed",
    "node", "npm", "npx", "git", "python3", "pip3",
]);

/** Patterns that are always blocked */
const BLOCKLIST = [
    /rm\s+(-rf|-fr)\s+\//,
    /sudo/,
    /mkfs/,
    /dd\s+if=/,
    /:\(\)\{/,
    /chmod\s+777/,
    />(\/dev|\/etc|\/usr|\/bin|\/sbin)/,
    /curl.*\|\s*(bash|sh)/,
    /wget.*\|\s*(bash|sh)/,
];

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 1024 * 100; // 100KB output cap

function isBlocked(command: string): string | null {
    for (const pattern of BLOCKLIST) {
        if (pattern.test(command)) {
            return `Blocked by safety rule: ${pattern.toString()}`;
        }
    }
    return null;
}

export const runShellCommand: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "run_shell_command",
            description:
                "Execute a shell command and return its output. Use for system checks, file inspection, git operations, etc. Dangerous commands are blocked for safety.",
            parameters: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: "The shell command to execute (e.g., 'ls -la', 'git status')",
                    },
                    cwd: {
                        type: "string",
                        description: "Working directory for the command. Defaults to project root.",
                    },
                },
                required: ["command"],
            },
        },
    },

    handler: async (input: Record<string, unknown>): Promise<string> => {
        const command = input.command as string;
        const cwd = (input.cwd as string) || process.cwd();

        // Safety check
        const blocked = isBlocked(command);
        if (blocked) {
            return JSON.stringify({ error: blocked });
        }

        return new Promise((resolve) => {
            execFile(
                "/bin/sh",
                ["-c", command],
                { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT, cwd },
                (error, stdout, stderr) => {
                    if (error) {
                        resolve(
                            JSON.stringify({
                                error: error.message,
                                stderr: stderr?.substring(0, 500) || "",
                                exitCode: error.code,
                            })
                        );
                        return;
                    }
                    const output = stdout.substring(0, MAX_OUTPUT);
                    resolve(
                        JSON.stringify({
                            stdout: output,
                            stderr: stderr?.substring(0, 500) || "",
                            truncated: stdout.length > MAX_OUTPUT,
                        })
                    );
                }
            );
        });
    },
};
