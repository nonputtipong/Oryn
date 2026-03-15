# Planning, Reviewing, and Implementing Workflow

This document outlines the strict assembly-line pipeline for taking ANY feature idea to shipped code. This workflow is **universal** and must be strictly followed by any AI agent, CLI, or IDE (Cursor, Windsurf, Copilot, Cline, etc.) operating in this workspace.

## The Assembly Line Pipeline

```text
Plan Creation -> Plan Audit -> Incremental Implementation -> Code Review -> Completion
```

At its core, LLMs are probabilistic while business logic is deterministic. To fix this mismatch, you must break down complex problems into deterministic, atomic steps.

---

## 1. 📋 Plan Creation Phase
**Trigger:** Start here for ANY non-trivial task (3+ steps, spanning multiple files, or architectural decisions).

1. **Explore First:** Before writing a plan, search the codebase (`grep_search`, `list_dir`, `view_file`) to understand the current architecture, existing patterns, and constraints. **Do not hallucinate files that do not exist.**
2. **Atomic Breakdown:** Break the task into small, isolated phases. 
   - **Rule of Thumb:** "30 small phases > 5 large phases". 
   - Each phase must fit inside a single context window. A phase should ideally touch 1-3 files maximum.
3. **Write the Plan:** Save the detailed breakdown to `.tmp/plan.md`.
   - Each phase must list exact files to modify.
   - Each phase must list strict acceptance criteria.
4. **User Checkpoint:** Pause and present the high-level plan to the user for approval. 

---

## 2. 🛡 Plan Audit Phase
**Trigger:** Runs automatically after user approves the plan.

- **Check Dependencies:** Verify that phase 2 does not rely on a function being built in phase 4. 
- **Check Data Flow:** Ensure phases agree on table names, component props, and API endpoints.
- If the plan is circular or fundamentally incoherent, **stop** and rewrite the plan. Do not proceed with execution.

---

## 3. 🛠 Incremental Implementation Phase
**Trigger:** Start building once the plan passes audit.
**Rules of Execution:** You must build phase-by-phase. **Do not skip ahead.**

1. **Context Recovery:** Always read `.tmp/plan.md` to determine the current active phase. This ensures you survive context window compactions when working in long IDE sessions.
2. **Read Codebase References:** Glob for a real representation of the required file in the codebase. If building a service, read an existing service. Mimic the existing structure.
3. **Step 0 is TDD:** If the project uses tests, write the test first (Test-Driven Development).
4. **Execute Deterministic Tools:** Run the Python scripts from `execution/` when applicable (e.g., executing a database migration, scraping a site).
5. **Mark Phase Complete:** Update `.tmp/plan.md` (e.g., change `[ ]` to `[x]`) and proceed to Code Review.

---

## 4. 🔍 Code Review & Verification Phase
**Trigger:** Before marking a phase or feature as "Done".

1. **Verify No Placeholders:** Ensure no skeleton content like `[To be detailed]` or `// TODO: Implement later` was left in the code.
2. **Codebase Compliance:** Ensure the generated code strictly matches framework rules (e.g., Next.js 15 Server Components, Tailwind CSS patterns, proper export patterns).
3. **Test & Compile:** You MUST prove the code works. Run the necessary local verification commands (`npm run build`, `npm test`, `uv check`, or equivalent typechecks).
4. **Auto-Fix Protocol:** If verification fails, do NOT immediately ask the user for help. Read the stack trace, formulate a hypothesis, apply the fix, and re-run.

---

## 5. 🔄 Self-Annealing & Correction
If the AI introduces an error that the human corrects:
1. Update `.tmp/lessons.md` or the corresponding `rules/` file with the newfound constraint. 
2. Iterate on these rules globally. Your instructions are a living document that must get smarter over time.

## Core Directives for All Agents
- **Simplicity First:** Make every change as simple as possible. Minimal impact footprint.
- **Context Management:** When you start losing context or forgetting variables, force a cleanup, re-read `.tmp/plan.md`, and focus strictly on the current phase.
- **Evidence Before Assertion:** Never claim a task is complete until you have verified the solution via tests, build commands, or visual confirmation.