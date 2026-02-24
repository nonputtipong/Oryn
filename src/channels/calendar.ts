// src/channels/calendar.ts — Google Calendar integration via REST API

interface GoogleCredentials {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
}

export interface CalendarEvent {
    id: string;
    summary: string;
    description: string;
    location: string;
    start: string;     // ISO datetime or date
    end: string;       // ISO datetime or date
    status: string;
    htmlLink: string;
    attendees: string[];
}

let credentials: GoogleCredentials | null = null;
let accessToken: string | null = null;
let tokenExpiry: number = 0;

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/**
 * Initialize Google Calendar with OAuth2 credentials.
 */
export function initCalendar(creds: GoogleCredentials): void {
    credentials = creds;
    console.log("✅ Google Calendar integration initialized");
}

/**
 * Refresh the access token using the refresh token.
 */
async function refreshAccessToken(): Promise<string> {
    if (!credentials) throw new Error("Calendar not initialized");
    if (accessToken && Date.now() < tokenExpiry) return accessToken;

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            refresh_token: credentials.refreshToken,
            grant_type: "refresh_token",
        }),
    });

    const data = await response.json() as { access_token: string; expires_in: number };
    if (!data.access_token) throw new Error("Failed to refresh Calendar access token");
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    return accessToken;
}

/**
 * Make an authenticated Calendar API request.
 */
async function calendarFetch(path: string, options: RequestInit = {}): Promise<unknown> {
    const token = await refreshAccessToken();
    const response = await fetch(`${CALENDAR_API}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Calendar API error: ${response.status} ${error}`);
    }

    return response.json();
}

/**
 * List upcoming calendar events.
 */
export async function listEvents(
    maxResults: number = 10,
    timeMin?: string,
    timeMax?: string,
    calendarId: string = "primary"
): Promise<CalendarEvent[]> {
    const now = new Date().toISOString();
    const params = new URLSearchParams({
        maxResults: String(maxResults),
        singleEvents: "true",
        orderBy: "startTime",
        timeMin: timeMin || now,
    });

    if (timeMax) params.set("timeMax", timeMax);

    const data = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`) as any;

    if (!data.items) return [];

    return data.items.map((event: any) => ({
        id: event.id,
        summary: event.summary || "(No title)",
        description: event.description || "",
        location: event.location || "",
        start: event.start?.dateTime || event.start?.date || "",
        end: event.end?.dateTime || event.end?.date || "",
        status: event.status || "",
        htmlLink: event.htmlLink || "",
        attendees: (event.attendees || []).map((a: any) => a.email),
    }));
}

/**
 * Create a new calendar event.
 */
export async function createEvent(
    summary: string,
    startTime: string,
    endTime: string,
    options: {
        description?: string;
        location?: string;
        attendees?: string[];
        calendarId?: string;
    } = {}
): Promise<CalendarEvent> {
    const calendarId = options.calendarId || "primary";

    const eventBody: any = {
        summary,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
    };

    if (options.description) eventBody.description = options.description;
    if (options.location) eventBody.location = options.location;
    if (options.attendees && options.attendees.length > 0) {
        eventBody.attendees = options.attendees.map((email) => ({ email }));
    }

    const result = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        body: JSON.stringify(eventBody),
    }) as any;

    return {
        id: result.id,
        summary: result.summary || summary,
        description: result.description || "",
        location: result.location || "",
        start: result.start?.dateTime || result.start?.date || startTime,
        end: result.end?.dateTime || result.end?.date || endTime,
        status: result.status || "confirmed",
        htmlLink: result.htmlLink || "",
        attendees: (result.attendees || []).map((a: any) => a.email),
    };
}

/**
 * Delete a calendar event.
 */
export async function deleteEvent(
    eventId: string,
    calendarId: string = "primary"
): Promise<boolean> {
    const token = await refreshAccessToken();
    const response = await fetch(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
        {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        }
    );

    // 204 No Content = success
    return response.status === 204 || response.ok;
}

/**
 * Update an existing calendar event.
 */
export async function updateEvent(
    eventId: string,
    updates: {
        summary?: string;
        description?: string;
        location?: string;
        startTime?: string;
        endTime?: string;
    },
    calendarId: string = "primary"
): Promise<CalendarEvent> {
    const body: any = {};
    if (updates.summary) body.summary = updates.summary;
    if (updates.description) body.description = updates.description;
    if (updates.location) body.location = updates.location;
    if (updates.startTime) body.start = { dateTime: updates.startTime };
    if (updates.endTime) body.end = { dateTime: updates.endTime };

    const result = await calendarFetch(
        `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
        { method: "PATCH", body: JSON.stringify(body) }
    ) as any;

    return {
        id: result.id,
        summary: result.summary || "",
        description: result.description || "",
        location: result.location || "",
        start: result.start?.dateTime || result.start?.date || "",
        end: result.end?.dateTime || result.end?.date || "",
        status: result.status || "",
        htmlLink: result.htmlLink || "",
        attendees: (result.attendees || []).map((a: any) => a.email),
    };
}

export function isCalendarAvailable(): boolean {
    return credentials !== null;
}
