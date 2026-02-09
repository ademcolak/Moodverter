# Moodverter Continuation Prompt (Use This In Every New Chat)

You are working on **Moodverter**.

## Project Snapshot
- This project was reset to a **clean start** state.
- Current direction: **YouTube core playback + moment-level transition discovery**.
- Advanced/legacy features (Spotify, mock mode, discovery pipelines, queue/history orchestration, etc.) were removed from active implementation.
- Documentation is centralized in:
  - General plan: `docs/PLAN.md`
  - Phase docs: `docs/phases/`

## Required Workflow
1. Read all phase files in `docs/phases/` (if any).
2. Continue from the **latest non-empty phase file** first.
3. If phase files are missing or empty, fallback to `docs/PLAN.md`.
4. If both are ambiguous or insufficient, ask the user a concise clarification question before implementation.

## Execution Rules
- Keep the implementation simple and incremental.
- Prefer stable base + measurable transition quality improvements.
- Do not reintroduce removed legacy paths unless explicitly requested.
- When you make changes, also update the relevant phase doc status/checklist.

## Output Expectations
- Start with what you changed.
- Include file-level references.
- Note what you verified (build/lint/tests).
- If you skipped verification, state that clearly.
