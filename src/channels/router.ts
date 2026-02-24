// src/channels/router.ts — Unified multi-channel message router

export interface Channel {
    id: string;
    type: "telegram" | "gmail" | "discord" | "webhook";
    formatOutbound(text: string): string;
    parseInbound(raw: unknown): string;
}

export interface RouteMessage {
    channel: string;
    userId: string | number;
    content: string;
    metadata?: Record<string, unknown>;
    timestamp: Date;
}

type MessageHandler = (msg: RouteMessage) => Promise<void>;
type Middleware = (msg: RouteMessage, next: () => Promise<void>) => Promise<void>;

/**
 * MessageBus — all messages flow through a single bus with per-channel formatting.
 */
export class MessageBus {
    private channels = new Map<string, Channel>();
    private handlers = new Map<string, MessageHandler[]>();
    private globalHandlers: MessageHandler[] = [];
    private middlewares: Middleware[] = [];

    /**
     * Register a channel.
     */
    registerChannel(channel: Channel): void {
        this.channels.set(channel.id, channel);
        console.log(`  📡 Channel registered: ${channel.id} (${channel.type})`);
    }

    /**
     * Add middleware that runs on every message.
     */
    use(middleware: Middleware): void {
        this.middlewares.push(middleware);
    }

    /**
     * Subscribe to messages from a specific channel.
     */
    onMessage(channelId: string, handler: MessageHandler): void {
        const existing = this.handlers.get(channelId) || [];
        existing.push(handler);
        this.handlers.set(channelId, existing);
    }

    /**
     * Subscribe to all messages.
     */
    onAnyMessage(handler: MessageHandler): void {
        this.globalHandlers.push(handler);
    }

    /**
     * Route an inbound message through the pipeline.
     */
    async routeInbound(channelId: string, userId: string | number, rawContent: unknown): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            console.warn(`  ⚠️ Unknown channel: ${channelId}`);
            return;
        }

        const msg: RouteMessage = {
            channel: channelId,
            userId,
            content: channel.parseInbound(rawContent),
            timestamp: new Date(),
        };

        // Run middleware chain
        let index = 0;
        const runNext = async (): Promise<void> => {
            if (index < this.middlewares.length) {
                const mw = this.middlewares[index++];
                await mw(msg, runNext);
            }
        };
        await runNext();

        // Run channel-specific handlers
        const channelHandlers = this.handlers.get(channelId) || [];
        for (const handler of channelHandlers) {
            await handler(msg);
        }

        // Run global handlers
        for (const handler of this.globalHandlers) {
            await handler(msg);
        }
    }

    /**
     * Send an outbound message to a specific channel.
     */
    formatOutbound(channelId: string, text: string): string {
        const channel = this.channels.get(channelId);
        if (!channel) return text;
        return channel.formatOutbound(text);
    }

    /**
     * Get all registered channels.
     */
    getChannels(): Array<{ id: string; type: string }> {
        return Array.from(this.channels.values()).map((c) => ({
            id: c.id,
            type: c.type,
        }));
    }
}

// ── Built-in channel: Telegram ──────────────────────────────────────

export const telegramChannel: Channel = {
    id: "telegram",
    type: "telegram",
    formatOutbound(text: string): string {
        // Telegram supports markdown — pass through
        return text;
    },
    parseInbound(raw: unknown): string {
        return typeof raw === "string" ? raw : JSON.stringify(raw);
    },
};

// ── Singleton message bus ───────────────────────────────────────────

export const messageBus = new MessageBus();

// Register Telegram by default
messageBus.registerChannel(telegramChannel);

// Logging middleware
messageBus.use(async (msg, next) => {
    console.log(`  📨 [${msg.channel}] ${msg.userId}: ${msg.content.substring(0, 80)}...`);
    await next();
});
