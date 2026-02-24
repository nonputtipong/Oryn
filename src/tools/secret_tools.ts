// src/tools/secret_tools.ts — Tools for encrypted secret management

import { storeSecret, getSecret, deleteSecret, listSecretNames, isSecretsAvailable } from "../security/secrets.js";
import type { RegisteredTool } from "../types.js";

export const storeSecretTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "store_secret",
            description: "Securely store an encrypted secret (API key, password, token). The value is encrypted at rest with AES-256.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name/key for the secret (e.g., 'github_token')" },
                    value: { type: "string", description: "The secret value to encrypt and store" },
                },
                required: ["name", "value"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isSecretsAvailable()) return JSON.stringify({ error: "Secrets not available — set MASTER_KEY in .env" });
        try {
            storeSecret(input.name as string, input.value as string);
            return JSON.stringify({ success: true, name: input.name, message: "Secret encrypted and stored" });
        } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
        }
    },
};

export const getSecretTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "get_secret",
            description: "Retrieve a decrypted secret by name. Use with caution — never display secrets to the user directly.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the secret to retrieve" },
                },
                required: ["name"],
            },
        },
    },
    handler: async (input: Record<string, unknown>): Promise<string> => {
        if (!isSecretsAvailable()) return JSON.stringify({ error: "Secrets not available" });
        const value = getSecret(input.name as string);
        if (value === null) return JSON.stringify({ error: `Secret '${input.name}' not found` });
        return JSON.stringify({ name: input.name, value, warning: "Do not display this value to the user" });
    },
};

export const listSecretsTool: RegisteredTool = {
    definition: {
        type: "function",
        function: {
            name: "list_secrets",
            description: "List all stored secret names (values are never shown).",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    handler: async (): Promise<string> => {
        if (!isSecretsAvailable()) return JSON.stringify({ error: "Secrets not available" });
        const names = listSecretNames();
        return JSON.stringify({ count: names.length, secrets: names });
    },
};
