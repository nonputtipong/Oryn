// src/tools/canvas_tools.ts — Canvas tools for the agent

import { pushWidget, clearCanvas, isCanvasAvailable, getCanvasPort } from "../canvas/canvas.js";
import type { RegisteredTool } from "../types.js";

export const createChartTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "create_chart",
            description: "Push an interactive chart to the Live Canvas. Provide chart data as HTML with inline JavaScript (e.g., using Chart.js CDN).",
            parameters: {
                type: "object",
                properties: {
                    html: { type: "string", description: "HTML content for the chart widget (can include <canvas>, <script> tags)" },
                    title: { type: "string", description: "Optional title for the chart" },
                },
                required: ["html"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isCanvasAvailable()) return JSON.stringify({ error: "Canvas not running" });
        const title = input.title ? `<h3 style="margin-bottom:12px">${input.title}</h3>` : "";
        const id = pushWidget("chart", title + (input.html as string));
        return JSON.stringify({ success: true, widgetId: id, canvasUrl: `http://localhost:${getCanvasPort()}` });
    },
};

export const createTableTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "create_table",
            description: "Push an interactive data table to the Live Canvas.",
            parameters: {
                type: "object",
                properties: {
                    headers: { type: "array", items: { type: "string" }, description: "Column headers" },
                    rows: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Row data as 2D array" },
                    title: { type: "string", description: "Optional title" },
                },
                required: ["headers", "rows"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isCanvasAvailable()) return JSON.stringify({ error: "Canvas not running" });

        const headers = input.headers as string[];
        const rows = input.rows as string[][];
        const title = input.title ? `<h3 style="margin-bottom:12px">${input.title}</h3>` : "";

        const headerHtml = headers.map((h) => `<th>${h}</th>`).join("");
        const rowsHtml = rows.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
        const html = `${title}<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;

        const id = pushWidget("table", html);
        return JSON.stringify({ success: true, widgetId: id, canvasUrl: `http://localhost:${getCanvasPort()}` });
    },
};

export const createFormTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "create_form",
            description: "Push an interactive form to the Live Canvas. Users can fill it in and submit.",
            parameters: {
                type: "object",
                properties: {
                    html: { type: "string", description: "HTML form content" },
                    title: { type: "string", description: "Optional title" },
                },
                required: ["html"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isCanvasAvailable()) return JSON.stringify({ error: "Canvas not running" });
        const title = input.title ? `<h3 style="margin-bottom:12px">${input.title}</h3>` : "";
        const id = pushWidget("form", title + (input.html as string));
        return JSON.stringify({ success: true, widgetId: id, canvasUrl: `http://localhost:${getCanvasPort()}` });
    },
};

export const pushHtmlTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "push_html",
            description: "Push arbitrary HTML/JS content to the Live Canvas.",
            parameters: {
                type: "object",
                properties: {
                    html: { type: "string", description: "HTML content to display" },
                },
                required: ["html"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isCanvasAvailable()) return JSON.stringify({ error: "Canvas not running" });
        const id = pushWidget("html", input.html as string);
        return JSON.stringify({ success: true, widgetId: id, canvasUrl: `http://localhost:${getCanvasPort()}` });
    },
};

export const clearCanvasTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "clear_canvas",
            description: "Clear all widgets from the Live Canvas.",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    handler: async (): Promise<string> => {
        if (!isCanvasAvailable()) return JSON.stringify({ error: "Canvas not running" });
        clearCanvas();
        return JSON.stringify({ success: true, message: "Canvas cleared" });
    },
};
