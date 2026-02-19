# Phase 01 - YouTube Core (Clean Start)

## Goal
Deliver a stable and simple YouTube-first flow:
- Add a YouTube URL
- Search on YouTube
- Play/Pause/Seek/Next/Previous
- Keep a lightweight local library

## Status Snapshot (2026-02-19)
- Library row click playback is active.
- Player init timeout/fallback is in place to reduce endless loading state risk.
- Core controls are preserved for play/pause/seek/next/previous.
- YouTube-only provider path remains the baseline.
- Transition hedefleri icin warmup/prefetch metadata hazirligi aktif.
- Transition gecisinde start-time cue + loudness envelope kullaniliyor.
- Transition oncesi kisa pre-duck handoff ile pseudo-crossfade hissi iyilestirildi.

## Scope
- In scope:
  - Minimal player UI
  - URL add + search add
  - Basic playback controls
  - Library list with remove action
- Out of scope:
  - Advanced recommendation logic
  - Multi-provider support
  - Non-core integrations

## Checklist
- [x] Replace complex app shell with minimal YouTube playback screen.
- [x] Keep only required provider path for YouTube.
- [x] Remove unused legacy feature files from src.
- [x] Remove audio analysis pipeline and keep playback-only flow.
- [x] Remove unused scripts/dependencies from the clean-start branch.
- [x] Polish UX details for add/search/library sections.
- [x] Add focused smoke tests for YouTube core path.

## Acceptance
- App starts directly on YouTube core UI.
- User can paste a YouTube link and immediately play it.
- User can search YouTube and play/add results.
- Basic transport controls and seek bar work.
- Typecheck, lint and build pass.

## Remaining (Core UX)
- [x] Further reduce perceived startup/playback stalls on very slow networks.
- [x] Keep button labels and panel texts consistently simple across the app.

## Verification (2026-02-10)
- `pnpm -s lint`
- `pnpm -s tsc --noEmit`
- `pnpm -s build`
- `pnpm -s smoke:test`
