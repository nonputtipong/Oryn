// src/proactive/briefing.ts — Morning briefing cron job

import cron from "node-cron";

interface BriefingConfig {
    time: string;       // HH:MM format
    userId: number;
    timezone?: string;
}

type BriefingSender = (userId: number, message: string) => Promise<void>;
type BriefingGatherer = () => Promise<string>;

let briefingTask: cron.ScheduledTask | null = null;
const gatherers: BriefingGatherer[] = [];

/**
 * Register a data gatherer for the briefing.
 * Gatherers are called in order and their outputs concatenated.
 */
export function addBriefingGatherer(gatherer: BriefingGatherer): void {
    gatherers.push(gatherer);
}

/**
 * Initialize the morning briefing cron job.
 */
export function initBriefing(config: BriefingConfig, sendFn: BriefingSender): void {
    const [hour, minute] = config.time.split(":").map(Number);

    if (isNaN(hour) || isNaN(minute)) {
        console.warn(`  ⚠️ Invalid briefing time: ${config.time}`);
        return;
    }

    // Cron: minute hour * * *
    const cronExpr = `${minute} ${hour} * * *`;

    briefingTask = cron.schedule(cronExpr, async () => {
        console.log("  🌅 Morning briefing triggered");
        try {
            const briefing = await gatherBriefing();
            await sendFn(config.userId, briefing);
            console.log("  ✅ Morning briefing sent");
        } catch (err) {
            console.warn(`  ⚠️ Briefing failed: ${(err as Error).message}`);
        }
    }, {
        timezone: config.timezone || "Asia/Bangkok",
    });

    console.log(`  ✅ Morning briefing scheduled at ${config.time} (${config.timezone || "Asia/Bangkok"})`);
}

/**
 * Gather all briefing data from registered gatherers.
 */
async function gatherBriefing(): Promise<string> {
    const sections: string[] = [];

    // Default: date and greeting
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    sections.push(`🌅 **Good morning!** It's ${dateStr}.`);

    // Run all registered gatherers
    for (const gatherer of gatherers) {
        try {
            const data = await gatherer();
            if (data.trim()) sections.push(data);
        } catch (err) {
            sections.push(`_(Failed to gather data: ${(err as Error).message})_`);
        }
    }

    if (sections.length === 1) {
        sections.push("No additional briefing data configured yet. Add gatherers for weather, calendar, tasks, and news.");
    }

    return sections.join("\n\n───\n\n");
}

/**
 * Stop the briefing cron job.
 */
export function stopBriefing(): void {
    if (briefingTask) {
        briefingTask.stop();
        briefingTask = null;
        console.log("  🛑 Morning briefing stopped");
    }
}

// ── Built-in gatherers ──────────────────────────────────────────────

/**
 * Memory summary gatherer — surfaces recent memories.
 */
export function createMemoryGatherer(
    getFactCount: () => number,
    getRecentFacts: (limit: number) => Array<{ content: string; category: string }>
): BriefingGatherer {
    return async () => {
        const count = getFactCount();
        const recent = getRecentFacts(5);
        if (recent.length === 0) return "";

        const factList = recent.map((f) => `  • [${f.category}] ${f.content}`).join("\n");
        return `🧠 **Memory** (${count} total facts)\nRecent:\n${factList}`;
    };
}

/**
 * Scheduled tasks gatherer — shows active cron jobs.
 */
export function createTaskGatherer(
    listTasks: () => Array<{ message: string; cron_expr: string; active: number }>
): BriefingGatherer {
    return async () => {
        const tasks = listTasks().filter((t) => t.active !== 0);
        if (tasks.length === 0) return "";

        const taskList = tasks.map((t) => `  • ${t.message} (${t.cron_expr})`).join("\n");
        return `📋 **Active Tasks** (${tasks.length})\n${taskList}`;
    };
}
