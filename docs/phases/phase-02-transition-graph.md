# Phase 02 - Transition Graph (Moment-Level Matching)

## Goal
Given a seed track, find high-quality transition points into other tracks:
- Input: currently playing track as seed (and optional source moment)
- Output: ranked transition candidates in `A@t1 -> B@t2` form

## Scope
- In scope:
  - Analysis queue and status tracking
  - Anchor/moment extraction per track
  - Candidate retrieval from embedding index
  - Transition scoring v2 and top-N ranking
- Out of scope:
  - Global catalog crawling
  - Guaranteed perfect transition for every track
  - Final production-grade playback engine tuning

## Data Model (v1)
### TransitionNode
- `id`
- `trackId`
- `timeMs`
- `eventType`
- `embedding`
- `bpmLocal`
- `chroma`
- `loudnessRms`

### TransitionEdgeScore (computed)
- `eventMatchScore`
- `embeddingSimilarity`
- `rhythmAlignmentScore`
- `loudnessContinuityScore`
- `artifactPenalty`
- `finalScore`

### AnalysisState
- `trackId`
- `status`: `pending | ready | failed`
- `updatedAt`
- `version`

## Scoring v2
Weighted score (higher is better):

`finalScore = w1*eventMatch + w2*embeddingSim + w3*rhythmAlign + w4*loudnessContinuity - w5*artifactPenalty`

Notes:
- `eventMatch` is a hard quality signal for cases like scream-to-scream.
- `rhythmAlignment` now includes tempo-ratio tolerance (`1x`, `0.5x`, `2x`) and harmonic compatibility.
- `artifactPenalty` prevents harsh or broken transitions.
- Weights will be tuned via listening tests.
- Phase 03 minispec (formula + fixtures): `docs/phases/phase-03-scoring-minispec.md`.

## Pipeline
1. Track added to library
2. Track enters `analysis_queue`
3. Analyzer extracts nodes
4. Nodes indexed for retrieval
5. Query returns top-N candidates with reasons and score breakdown

## API Surface (phase target)
- `enqueueTrackForAnalysis(trackId)`
- `getAnalysisState(trackId)`
- `findTransitionCandidates({ trackId, sourceTimeMs?, limit })`

## Checklist
- [x] Define TypeScript interfaces for node/score/state.
- [x] Implement analysis queue with persistent status.
- [x] Implement node extraction pipeline (v1, heuristic baseline).
- [x] Implement candidate retrieval + scoring.
- [x] Return top-N candidates with debug score breakdown.
- [x] Add evaluation checklist and baseline metrics.

## Task List (Execution Board)
### A) Data + Queue
- [x] Add transition node/type definitions.
- [x] Add persistent queue/state store (`localStorage`).
- [x] Add analysis status helpers (`pending|ready|failed`).

### B) Analysis (v1)
- [x] Add heuristic node extractor (`extractTransitionNodesV1`).
- [x] Add analysis entry API (`analyzeTrackWithHeuristicV1`).
- [x] Auto-enqueue/analyze tracks when added to YouTube library.

### C) Retrieval + Ranking
- [x] Add top-N candidate retrieval API.
- [x] Add scoring breakdown per candidate.
- [x] Add clamped weighted final score.
- [x] Surface transition candidates in UI (autoseed + top list).
- [x] Add diversity-aware rerank (reduce same-target repetition).
- [x] Add "play candidate at target time" action for quick transition checks.
- [x] Add autopilot transition behavior from active playback track.
- [x] Add transition warmup/prefetch metadata step before autoplay jump.
- [x] Add start-time cue transition playback path (direct target time load).
- [x] Add adaptive autoplay lead based on observed transition latency.
- [x] Add transition loudness smoothing envelope + compensation.
- [x] Add pre-transition handoff pre-duck (pseudo-crossfade approximation).
- [x] Add ANN retrieval prototype (hnswlib-node optional, brute-force fallback).

### D) Evaluation
- [x] Define baseline metrics (`Hit@K`, `MeanScore`) utility functions.
- [x] Add manual listening checklist doc for Phase 02.
- [x] Add in-app baseline evaluation runner (coverage/top score summary).
- [x] Record first baseline run results on a curated seed set.
- [x] Add labeled relevance storage and background auto-label path.
- [x] Wire labeled relevance into baseline output (`Hit@3`, `Hit@5`, `labeledSeedCount`).
- [x] Split baseline run scope (`Seed Baseline` vs `Tum Seed Baseline`) to avoid metric confusion.
- [x] Add `Bottom-3` tuning action validation summary/gate on benchmark runs.
- [x] Auto-maintain benchmark seed set quality while benchmark set is active.

## Recent Notes (2026-02-20)
- Baseline values staying constant while switching seed was caused by global run scope, not a scoring bug.
- Scope split in UI fixed interpretation: seed-level checks and full-set checks are now explicit.
- Current bottleneck is data quality (label coverage), not missing evaluation infrastructure.
- Active seed is now derived from playing track; manual seed selector is removed from primary flow.
- Transition timing trigger was shifted earlier to reduce perceived wait before jump.
- Transition playback now warms target metadata and uses start-time cue for lower perceived stall.
- Auto transition lead now self-adjusts from observed switch latency.
- Candidate list now surfaces loudness delta (`LoudΔ`) for transition debugging.
- Pseudo-crossfade handoff uses short pre-duck before autoplay jump.
- Benchmark scope now reports tuning validation summary against previous comparable run.
- Checklist panel was removed from UI; checklist remains as manual QA guidance in docs.
- Retrieval stage now supports ANN index prototype with in-memory fallback.

## Acceptance
- Given one seed track, system returns ranked transition candidates.
- Output includes `sourceTimeMs`, `targetTrackId`, `targetTimeMs`, `finalScore`.
- At least one candidate is subjectively "good transition" in manual listening checks for curated test set.
- Build/lint/typecheck pass.

## Remaining
- [x] Reduce single-player transition stalls with better prefetch/cue strategy.
- [x] Tune handoff envelope params (`duck/ramp/hold`) for harsh network variability.
