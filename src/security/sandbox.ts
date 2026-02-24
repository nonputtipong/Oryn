// src/security/sandbox.ts — Container sandboxing for shell commands

import { execFile } from "child_process";
import { resolve } from "path";

interface SandboxOptions {
    command: string;
    cwd?: string;
    timeout?: number;
    memoryLimit?: string;
    mountDirs?: string[];
    readOnly?: boolean;
}

interface SandboxResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    sandboxed: boolean;
}

const DEFAULT_IMAGE = "node:20-slim";
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MEMORY = "256m";
const MAX_OUTPUT = 10000;

let sandboxEnabled = false;
let sandboxImage = DEFAULT_IMAGE;

export function initSandbox(enabled: boolean, image?: string): void {
    sandboxEnabled = enabled;
    if (image) sandboxImage = image;

    if (sandboxEnabled) {
        // Check if Docker is available
        execFile("docker", ["version", "--format", "{{.Server.Version}}"], { timeout: 5000 }, (err, stdout) => {
            if (err) {
                console.warn("  ⚠️ Docker not available — sandbox will fall back to host execution");
                sandboxEnabled = false;
            } else {
                console.log(`  ✅ Container sandbox enabled (Docker ${stdout.trim()}, image: ${sandboxImage})`);
            }
        });
    }
}

/**
 * Run a command in a Docker container or fall back to host execution.
 */
export function runInSandbox(options: SandboxOptions): Promise<SandboxResult> {
    if (!sandboxEnabled) {
        return runOnHost(options);
    }

    return new Promise((resolvePromise) => {
        const {
            command,
            cwd = "/workspace",
            timeout = DEFAULT_TIMEOUT,
            memoryLimit = DEFAULT_MEMORY,
            mountDirs = [],
            readOnly = true,
        } = options;

        const args: string[] = [
            "run",
            "--rm",
            "--network=none",           // No network access
            `--memory=${memoryLimit}`,   // Memory limit
            "--pids-limit=50",           // Process limit
            "--read-only",              // Read-only root filesystem
            "--tmpfs=/tmp:size=64m",    // Writable /tmp
            "-w", cwd,
        ];

        // Mount directories
        for (const dir of mountDirs) {
            const absDir = resolve(dir);
            const mountFlag = readOnly ? "ro" : "rw";
            args.push("-v", `${absDir}:/workspace:${mountFlag}`);
        }

        // If no mount dirs, mount cwd
        if (mountDirs.length === 0) {
            const hostCwd = process.cwd();
            const mountFlag = readOnly ? "ro" : "rw";
            args.push("-v", `${hostCwd}:/workspace:${mountFlag}`);
        }

        args.push(sandboxImage, "/bin/sh", "-c", command);

        execFile("docker", args, {
            timeout,
            maxBuffer: MAX_OUTPUT,
        }, (err, stdout, stderr) => {
            const exitCode = err && "code" in err ? (err as any).code ?? 1 : 0;
            resolvePromise({
                stdout: stdout.substring(0, MAX_OUTPUT),
                stderr: stderr.substring(0, MAX_OUTPUT),
                exitCode: typeof exitCode === "number" ? exitCode : 1,
                sandboxed: true,
            });
        });
    });
}

/**
 * Fallback: run command on host (existing behavior).
 */
function runOnHost(options: SandboxOptions): Promise<SandboxResult> {
    return new Promise((resolvePromise) => {
        const { command, cwd = process.cwd(), timeout = DEFAULT_TIMEOUT } = options;

        execFile("/bin/sh", ["-c", command], {
            timeout,
            maxBuffer: MAX_OUTPUT,
            cwd,
        }, (err, stdout, stderr) => {
            const exitCode = err && "code" in err ? (err as any).code ?? 1 : 0;
            resolvePromise({
                stdout: stdout.substring(0, MAX_OUTPUT),
                stderr: stderr.substring(0, MAX_OUTPUT),
                exitCode: typeof exitCode === "number" ? exitCode : 1,
                sandboxed: false,
            });
        });
    });
}

export function isSandboxEnabled(): boolean {
    return sandboxEnabled;
}
