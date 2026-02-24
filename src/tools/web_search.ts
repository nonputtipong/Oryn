// src/tools/web_search.ts — Web search via DuckDuckGo (no API key needed)

import type { RegisteredTool } from "../types.js";

interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

async function searchDuckDuckGo(query: string, maxResults: number = 5): Promise<SearchResult[]> {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; GravityClaw/1.0)",
        },
    });

    if (!response.ok) {
        throw new Error(`DuckDuckGo returned ${response.status}`);
    }

    const html = await response.text();
    const results: SearchResult[] = [];

    // Parse results from DuckDuckGo HTML
    const resultBlocks = html.split('class="result__body"');

    for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
        const block = resultBlocks[i];

        // Extract title
        const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
        const title = titleMatch?.[1]?.trim() || "";

        // Extract URL
        const urlMatch = block.match(/href="([^"]*uddg=([^&"]*))/);
        let resultUrl = "";
        if (urlMatch?.[2]) {
            try {
                resultUrl = decodeURIComponent(urlMatch[2]);
            } catch {
                resultUrl = urlMatch[2];
            }
        }

        // Extract snippet
        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
        let snippet = snippetMatch?.[1]?.trim() || "";
        snippet = snippet.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

        if (title && resultUrl) {
            results.push({ title, url: resultUrl, snippet });
        }
    }

    return results;
}

export const webSearch: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "web_search",
            description:
                "Search the web using DuckDuckGo. Returns top results with titles, snippets, and URLs. Use for current events, facts, documentation lookups.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The search query",
                    },
                    max_results: {
                        type: "number",
                        description: "Maximum number of results to return (default: 5, max: 10)",
                    },
                },
                required: ["query"],
            },
        },
    },

    handler: async (input: Record<string, unknown>): Promise<string> => {
        const query = input.query as string;
        const maxResults = Math.min((input.max_results as number) || 5, 10);

        try {
            const results = await searchDuckDuckGo(query, maxResults);
            if (results.length === 0) {
                return JSON.stringify({ query, results: [], message: "No results found" });
            }
            return JSON.stringify({ query, count: results.length, results });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};
