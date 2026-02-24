// src/tools/scheduler_tools.ts — Scheduler tools for the agent

import { scheduleTask, listTasks, deleteTask, pauseTask } from "../scheduler/cron.js";
import type { RegisteredTool } from "../types.js";

export const scheduleTaskTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "schedule_task",
            description:
                "Schedule a recurring task/reminder using cron expressions. Examples: '0 9 * * *' (daily 9am), '*/30 * * * *' (every 30min), '0 9 * * 1' (Mondays 9am).",
            parameters: {
                type: "object",
                properties: {
                    cron_expression: {
                        type: "string",
                        description: "Cron expression (minute hour day month weekday). E.g., '0 9 * * *' for daily at 9am",
                    },
                    message: {
                        type: "string",
                        description: "Message to send when the task triggers",
                    },
                    user_id: {
                        type: "number",
                        description: "Telegram user ID to send the reminder to",
                    },
                },
                required: ["cron_expression", "message", "user_id"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        try {
            const id = scheduleTask(
                input.cron_expression as string,
                input.message as string,
                input.user_id as number
            );
            return JSON.stringify({ success: true, id, cron: input.cron_expression, message: input.message });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};

export const listScheduledTasksTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "list_scheduled_tasks",
            description: "List all scheduled tasks/reminders.",
            parameters: {
                type: "object",
                properties: {
                    user_id: { type: "number", description: "Filter by user ID (optional)" },
                },
                required: [],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const tasks = listTasks(input.user_id as number | undefined);
        return JSON.stringify({ count: tasks.length, tasks });
    },
};

export const deleteScheduledTaskTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "delete_scheduled_task",
            description: "Delete a scheduled task by its ID.",
            parameters: {
                type: "object",
                properties: {
                    task_id: { type: "number", description: "ID of the task to delete" },
                },
                required: ["task_id"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        const success = deleteTask(input.task_id as number);
        return JSON.stringify({
            success,
            message: success ? `Deleted task #${input.task_id}` : `Task #${input.task_id} not found`,
        });
    },
};
