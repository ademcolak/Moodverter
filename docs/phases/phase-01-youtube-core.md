# Phase 01 - YouTube Core (Clean Start)

## Goal
Deliver a stable and simple YouTube-first flow:
- Add a YouTube URL
- Search on YouTube
- Play/Pause/Seek/Next/Previous
- Keep a lightweight local library

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
- [ ] Add focused smoke tests for YouTube core path.

## Acceptance
- App starts directly on YouTube core UI.
- User can paste a YouTube link and immediately play it.
- User can search YouTube and play/add results.
- Basic transport controls and seek bar work.
- Typecheck, lint and build pass.
