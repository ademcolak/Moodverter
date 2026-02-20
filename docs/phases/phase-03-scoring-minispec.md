# Phase 03 - Scoring v2 Minispec

## Purpose
Define a deterministic `scoreTransition` contract so tuning and regression checks use the same formula and edge-case behavior.

## Version
- `TRANSITION_SCORING_VERSION = "v2"`
- Source of truth: `/Users/ademcolak/dev/arge/Moodverter/src/services/transition/service.ts`

## Inputs
Two `TransitionNode` values:
- `sourceNode`
- `targetNode`

Relevant fields:
- `eventType`, `eventConfidence`
- `embedding` (len 16 expected after sanitization)
- `bpmLocal`, `chroma` (len 12 expected after sanitization)
- `loudnessRms`

## Sanitization Rules
- Unknown `eventType` falls back to `other`.
- `eventConfidence` is clamped to `[0, 1]`.
- `embedding` is sanitized to numeric vector length `16` (non-numeric -> `0`, pad/truncate).
- `chroma` is sanitized to numeric vector length `12`.
- Non-finite numeric fields fallback:
  - `bpmLocal -> 120`
  - `loudnessRms -> -12`

## Formula
Weights:
- `eventMatch = 0.35`
- `embedding = 0.30`
- `rhythm = 0.20`
- `loudness = 0.15`
- `artifactPenalty = 0.25` (subtracted)

### Subscores
1. Event match
`eventMatchScore = clamp(eventCompatibility(source.eventType, target.eventType) * min(confSource, confTarget), 0, 1)`

2. Embedding similarity
`embeddingSimilarity = clamp((cosine(embeddingSource, embeddingTarget) + 1) / 2, 0, 1)`

3. Rhythm alignment (tempo-ratio + harmonic aware)
- `tempoRatioScore = 1 - clamp(min(abs(bpmSource-bpmTarget), abs(2*bpmSource-bpmTarget), abs(bpmSource-2*bpmTarget)) / 40, 0, 1)`
- `chromaCosineScore = embedding-style cosine on chroma`
- `harmonicCompatibilityScore = key-distance heuristic from chroma argmax`
- `rhythmAlignmentScore = clamp(0.5 * tempoRatioScore + 0.25 * chromaCosineScore + 0.25 * harmonicCompatibilityScore, 0, 1)`

4. Loudness continuity
`loudnessContinuityScore = 1 - clamp(abs(loudnessSource - loudnessTarget) / 24, 0, 1)`

5. Artifact penalty
- `bpmDiffPenalty = clamp(abs(bpmSource - bpmTarget) / 80, 0, 1)`
- `loudnessPenalty = clamp(abs(loudnessSource - loudnessTarget) / 36, 0, 1)`
- `artifactPenalty = clamp(0.5 * bpmDiffPenalty + 0.5 * loudnessPenalty, 0, 1)`

### Final score
`finalScore = clamp(0.35*event + 0.30*embedding + 0.20*rhythm + 0.15*loudness - 0.25*penalty, 0, 1)`

## Diagnostic Driver Rule
Primary driver is selected by max weighted positive component:
- `0.35*event`, `0.30*embedding`, `0.20*rhythm`, `0.15*loudness`

If `0.25*artifactPenalty` is greater than the best positive component, driver is `penalty`.

## Pseudocode
```text
sanitize source, target
event = compatible[eventTypeSource][eventTypeTarget] * min(confSource, confTarget)
embed = cosineScaled(source.embedding, target.embedding)
tempo = tempoRatioScore(source.bpm, target.bpm) // half/double-time tolerant
harm = harmonicCompatibility(source.chroma, target.chroma)
rhythm = 0.5 * tempo + 0.25 * chromaCosineScaled + 0.25 * harm
loud = 1 - clamp(abs(loudnessDiff) / 24)
penalty = 0.5 * clamp(abs(bpmDiff) / 80) + 0.5 * clamp(abs(loudnessDiff) / 36)

final = clamp(0.35*event + 0.30*embed + 0.20*rhythm + 0.15*loud - 0.25*penalty)
driver = maxWeightedPositive unless weightedPenalty is bigger
```

## Fixture Set (Regression Contract)
Source: `/Users/ademcolak/dev/arge/Moodverter/tests/transition-scoring-fixtures.smoke.test.ts`

1. Fixture A (perfect alignment)
- Expected `finalScore = 1`
- Expected driver: `event`

2. Fixture B (harsh mismatch)
- Expected `eventMatchScore = 0.05`
- Expected `tempoRatioScore = 0.5`
- Expected `harmonicCompatibilityScore = 0.3`
- Expected `rhythmAlignmentScore = 0.325`
- Expected `artifactPenalty = 1`
- Expected `finalScore = 0` (clamped)
- Expected driver: `penalty`

3. Fixture C (sanitization + fallback)
- Unknown source event type -> `other`
- Expected `eventMatchScore = 0.2`
- Expected `tempoRatioScore = 0.5`
- Expected `harmonicCompatibilityScore = 1`
- Expected `rhythmAlignmentScore = 0.5`
- Expected `artifactPenalty = 7/24`
- Expected `finalScore = 413/2400`
- Expected driver: `rhythm`
