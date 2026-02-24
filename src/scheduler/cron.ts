// src/scheduler/cron.ts — Task scheduler using node-cron

import cron from "node-cron";
import { getDatabase } from "../memory/sqlite.js";

interface ScheduledTask {
    id: number;
    cron_expr: string;
    message: string;
    user_id: number;
    active: number;
    created_at: string;
}

// Active cron jobs mapped by task ID
const activeJobs = new Map<number, cron.ScheduledTask>();

// Callback to send a message to a user
let sendMessageCallback: ((userId: number, message: string) => Promise<void>) | null = null;

export function setMessageCallback(callback: (userId: number, message: string) => Promise<void>): void {
    sendMessageCallback = callback;
}

export function scheduleTask(cronExpr: string, message: string, userId: number): number {
    // Validate cron expression
    if (!cron.validate(cronExpr)) {
        throw new Error(`Invalid cron expression: "${cronExpr}"`);
    }

    const db = getDatabase();
    const result = db.prepare(
        "INSERT INTO scheduled_tasks (cron_expr, message, user_id) VALUES (?, ?, ?)"
    ).run(cronExpr, message, userId);

    const taskId = result.lastInsertRowid as number;

    // Start the cron job
    startJob(taskId, cronExpr, message, userId);

    return taskId;
}

function startJob(taskId: number, cronExpr: string, message: string, userId: number): void {
    const job = cron.schedule(cronExpr, async () => {
        console.log(`⏰ Scheduled task ${taskId} triggered: ${message}`);
        if (sendMessageCallback) {
            try {
                await sendMessageCallback(userId, `⏰ *Scheduled Reminder*\n\n${message}`);
            } catch (err) {
                console.error(`❌ Failed to send scheduled message: ${(err as Error).message}`);
            }
        }
    });

    activeJobs.set(taskId, job);
}

export function listTasks(userId?: number): ScheduledTask[] {
    const db = getDatabase();
    if (userId) {
        return db.prepare("SELECT * FROM scheduled_tasks WHERE user_id = ? ORDER BY created_at DESC").all(userId) as ScheduledTask[];
    }
    return db.prepare("SELECT * FROM scheduled_tasks ORDER BY created_at DESC").all() as ScheduledTask[];
}

export { listTasks as listScheduledTasks };

export function deleteTask(taskId: number): boolean {
    const db = getDatabase();
    const result = db.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(taskId);

    // Stop the cron job
    const job = activeJobs.get(taskId);
    if (job) {
        job.stop();
        activeJobs.delete(taskId);
    }

    return result.changes > 0;
}

export function pauseTask(taskId: number): boolean {
    const db = getDatabase();
    const task = db.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(taskId) as ScheduledTask | undefined;
    if (!task) return false;

    const newState = task.active ? 0 : 1;
    db.prepare("UPDATE scheduled_tasks SET active = ? WHERE id = ?").run(newState, taskId);

    const job = activeJobs.get(taskId);
    if (job) {
        if (newState === 0) job.stop();
        else job.start();
    }

    return true;
}

/**
 * Restore all active scheduled tasks from the database.
 * Call on bot startup.
 */
export function restoreScheduledTasks(): number {
    const db = getDatabase();
    const tasks = db.prepare("SELECT * FROM scheduled_tasks WHERE active = 1").all() as ScheduledTask[];

    for (const task of tasks) {
        try {
            startJob(task.id, task.cron_expr, task.message, task.user_id);
        } catch (err) {
            console.warn(`⚠️ Failed to restore task ${task.id}: ${(err as Error).message}`);
        }
    }

    if (tasks.length > 0) {
        console.log(`✅ Restored ${tasks.length} scheduled task(s)`);
    }

    return tasks.length;
}
