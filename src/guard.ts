// src/guard.ts — User whitelist security guard

/**
 * Checks if a Telegram user ID is in the allowed whitelist.
 * Returns false for unauthorized users — the bot should silently ignore them.
 */
export function isAllowedUser(userId: number, allowedUserIds: number[]): boolean {
    return allowedUserIds.includes(userId);
}
