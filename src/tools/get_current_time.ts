// src/tools/get_current_time.ts — Returns the current date and time

import type { RegisteredTool } from "../types.js";

export const getCurrentTime: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "get_current_time",
            description:
                "Get the current date and time. Optionally specify a timezone (IANA format, e.g. 'Asia/Bangkok', 'America/New_York'). Defaults to the system timezone.",
            parameters: {
                type: "object",
                properties: {
                    timezone: {
                        type: "string",
                        description: "IANA timezone name (e.g. 'Asia/Bangkok'). Defaults to system timezone.",
                    },
                },
                required: [],
            },
        },
    },

    handler: async (input: Record<string, unknown>): Promise<string> => {
        const timezone = (input.timezone as string) || undefined;

        try {
            const now = new Date();
            const formatted = now.toLocaleString("en-US", {
                timeZone: timezone,
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZoneName: "long",
            });

            const iso = timezone
                ? now.toLocaleString("sv-SE", { timeZone: timezone }).replace(" ", "T")
                : now.toISOString();

            return JSON.stringify({
                formatted,
                iso,
                timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                unix: Math.floor(now.getTime() / 1000),
            });
        } catch {
            return JSON.stringify({ error: `Invalid timezone: "${timezone}"` });
        }
    },
};
