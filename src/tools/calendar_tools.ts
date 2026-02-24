// src/tools/calendar_tools.ts — Calendar tools for the LLM agent

import type { RegisteredTool } from "../types.js";
import { isCalendarAvailable, listEvents, createEvent, deleteEvent } from "../channels/calendar.js";

const NOT_CONFIGURED = JSON.stringify({ error: "Google Calendar not configured — set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and re-auth with calendar scope" });

export const listCalendarEventsTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "list_calendar_events",
            description: "List upcoming Google Calendar events. Returns events sorted by start time. Use ISO 8601 datetime strings for timeMin/timeMax.",
            parameters: {
                type: "object",
                properties: {
                    max_results: { type: "number", description: "Maximum number of events to return (default: 10)" },
                    time_min: { type: "string", description: "Start of time range in ISO 8601 format (e.g., '2026-02-24T00:00:00+07:00'). Defaults to now." },
                    time_max: { type: "string", description: "End of time range in ISO 8601 format. Optional." },
                },
                required: [],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isCalendarAvailable()) return NOT_CONFIGURED;
        try {
            const events = await listEvents(
                (input.max_results as number) || 10,
                input.time_min as string | undefined,
                input.time_max as string | undefined,
            );
            return JSON.stringify({ count: events.length, events });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};

export const createCalendarEventTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "create_calendar_event",
            description: "Create a new Google Calendar event. Requires a title, start time, and end time in ISO 8601 format. Optionally include description, location, and attendee emails.",
            parameters: {
                type: "object",
                properties: {
                    summary: { type: "string", description: "Title of the event" },
                    start_time: { type: "string", description: "Start time in ISO 8601 format (e.g., '2026-02-24T14:00:00+07:00')" },
                    end_time: { type: "string", description: "End time in ISO 8601 format (e.g., '2026-02-24T15:00:00+07:00')" },
                    description: { type: "string", description: "Optional event description" },
                    location: { type: "string", description: "Optional event location" },
                    attendees: {
                        type: "array",
                        items: { type: "string" },
                        description: "Optional list of attendee email addresses",
                    },
                },
                required: ["summary", "start_time", "end_time"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isCalendarAvailable()) return NOT_CONFIGURED;
        try {
            const event = await createEvent(
                input.summary as string,
                input.start_time as string,
                input.end_time as string,
                {
                    description: input.description as string | undefined,
                    location: input.location as string | undefined,
                    attendees: input.attendees as string[] | undefined,
                },
            );
            return JSON.stringify({ success: true, event });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};

export const deleteCalendarEventTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "delete_calendar_event",
            description: "Delete a Google Calendar event by its event ID.",
            parameters: {
                type: "object",
                properties: {
                    event_id: { type: "string", description: "The ID of the calendar event to delete" },
                },
                required: ["event_id"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isCalendarAvailable()) return NOT_CONFIGURED;
        try {
            const success = await deleteEvent(input.event_id as string);
            return JSON.stringify({ success, message: success ? "Event deleted" : "Failed to delete event" });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};
