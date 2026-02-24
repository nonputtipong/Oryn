// src/channels/drive.ts — Google Drive integration via REST API

interface GoogleCredentials {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
}

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    size: string;
    modifiedTime: string;
    webViewLink: string;
    owners: string[];
}

let credentials: GoogleCredentials | null = null;
let accessToken: string | null = null;
let tokenExpiry: number = 0;

const DRIVE_API = "https://www.googleapis.com/drive/v3";

/**
 * Initialize Google Drive with OAuth2 credentials.
 */
export function initDrive(creds: GoogleCredentials): void {
    credentials = creds;
    console.log("✅ Google Drive integration initialized");
}

/**
 * Refresh the access token using the refresh token.
 */
async function refreshAccessToken(): Promise<string> {
    if (!credentials) throw new Error("Drive not initialized");
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
    if (!data.access_token) throw new Error("Failed to refresh Drive access token");
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    return accessToken;
}

/**
 * Make an authenticated Drive API request.
 */
async function driveFetch(path: string, options: RequestInit = {}): Promise<unknown> {
    const token = await refreshAccessToken();
    const url = path.startsWith("http") ? path : `${DRIVE_API}${path}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Drive API error: ${response.status} ${error}`);
    }

    return response.json();
}

/**
 * Search for files on Google Drive.
 */
export async function searchFiles(
    query: string,
    maxResults: number = 10,
): Promise<DriveFile[]> {
    // Build Google Drive query from the user's search term
    const driveQuery = `fullText contains '${query.replace(/'/g, "\\'")}'` +
        ` and trashed = false`;

    const params = new URLSearchParams({
        q: driveQuery,
        pageSize: String(maxResults),
        fields: "files(id,name,mimeType,size,modifiedTime,webViewLink,owners)",
        orderBy: "modifiedTime desc",
    });

    const data = await driveFetch(`/files?${params}`) as any;

    if (!data.files) return [];

    return data.files.map((file: any) => ({
        id: file.id,
        name: file.name || "(Untitled)",
        mimeType: file.mimeType || "",
        size: file.size || "unknown",
        modifiedTime: file.modifiedTime || "",
        webViewLink: file.webViewLink || "",
        owners: (file.owners || []).map((o: any) => o.emailAddress),
    }));
}

/**
 * List recent files on Google Drive.
 */
export async function listFiles(maxResults: number = 10): Promise<DriveFile[]> {
    const params = new URLSearchParams({
        pageSize: String(maxResults),
        fields: "files(id,name,mimeType,size,modifiedTime,webViewLink,owners)",
        orderBy: "modifiedTime desc",
        q: "trashed = false",
    });

    const data = await driveFetch(`/files?${params}`) as any;

    if (!data.files) return [];

    return data.files.map((file: any) => ({
        id: file.id,
        name: file.name || "(Untitled)",
        mimeType: file.mimeType || "",
        size: file.size || "unknown",
        modifiedTime: file.modifiedTime || "",
        webViewLink: file.webViewLink || "",
        owners: (file.owners || []).map((o: any) => o.emailAddress),
    }));
}

/**
 * Read the content of a file.
 * For Google Docs/Sheets/Slides, exports as plain text.
 * For regular files, downloads the content directly.
 */
export async function readFile(fileId: string): Promise<{ name: string; content: string; mimeType: string }> {
    // First, get file metadata
    const meta = await driveFetch(`/files/${fileId}?fields=name,mimeType`) as any;

    const googleMimeExports: Record<string, string> = {
        "application/vnd.google-apps.document": "text/plain",
        "application/vnd.google-apps.spreadsheet": "text/csv",
        "application/vnd.google-apps.presentation": "text/plain",
    };

    const token = await refreshAccessToken();
    let content: string;

    if (googleMimeExports[meta.mimeType]) {
        // Export Google Workspace files
        const exportMime = googleMimeExports[meta.mimeType];
        const response = await fetch(
            `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) throw new Error(`Drive export error: ${response.status}`);
        content = await response.text();
    } else {
        // Download regular files
        const response = await fetch(
            `${DRIVE_API}/files/${fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) throw new Error(`Drive download error: ${response.status}`);

        // Only read text-based files; for binary files, return metadata only
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text") || contentType.includes("json") || contentType.includes("xml") || contentType.includes("csv")) {
            content = await response.text();
        } else {
            content = `[Binary file — ${meta.mimeType}, download via Google Drive link]`;
        }
    }

    // Truncate very large files
    if (content.length > 10000) {
        content = content.substring(0, 10000) + "\n\n... [truncated — file too large to display fully]";
    }

    return { name: meta.name, content, mimeType: meta.mimeType };
}

export function isDriveAvailable(): boolean {
    return credentials !== null;
}
