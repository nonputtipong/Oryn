# Level 1 — Foundation

> **Goal:** Telegram bot + Claude LLM + agentic tool loop with `get_current_time`

## Architecture

```
Telegram (long-polling) → Grammy bot → Guard (whitelist) → Agent (ReAct loop) → Claude API
                                                                ↕
                                                          Tool Registry
                                                               ↓
                                                        get_current_time
```

## How to Run

```bash
# 1. Install dependencies
npm install

# 2. Fill in .env with your keys
#    - TELEGRAM_BOT_TOKEN (from @BotFather)
#    - ANTHROPIC_API_KEY (from console.anthropic.com)
#    - ALLOWED_USER_IDS (from @userinfobot on Telegram)

# 3. Start the bot
npm run dev
```

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point — Grammy bot, long-polling, message routing |
| `src/config.ts` | Loads and validates `.env` |
| `src/guard.ts` | User ID whitelist check |
| `src/agent.ts` | ReAct loop — LLM ↔ tool cycle, max 10 iterations |
| `src/types.ts` | Shared TypeScript types |
| `src/tools/registry.ts` | Central tool registry |
| `src/tools/get_current_time.ts` | First tool — current date/time |

## Security

- ✅ No web server — Telegram long-polling only
- ✅ User ID whitelist — silently ignores unauthorized users
- ✅ Secrets in `.env` only
- ✅ Max iteration limit on agent loop (10)

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message with usage hints |
| `/clear` | Reset conversation history |

## Edge Cases & Learnings

- Telegram has a 4096 character limit per message — `index.ts` auto-splits long responses
- Markdown parse errors in Telegram — fallback to plain text on failure
- Grammy uses long-polling by default (no webhook setup needed)
