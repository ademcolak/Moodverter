# Phase 02 Evaluation Checklist

## Purpose
Track baseline transition quality while iterating on moment matching and scoring.

## Seed Set
- Minimum 10 seed tracks
- Include mixed genres and vocal/percussive-heavy examples
- Each seed track should have at least 5 analyzed target tracks

## Metrics (Baseline v1)
- `Hit@3`: Is at least one relevant transition in top 3?
- `Hit@5`: Is at least one relevant transition in top 5?
- `MeanScore@5`: Mean `finalScore` for top 5 candidates

## Manual Listening Checklist (per seed track)
- [ ] Transition is not abrupt or broken.
- [ ] Timing alignment feels intentional (`A@t1 -> B@t2`).
- [ ] Loudness jump is acceptable.
- [ ] Event continuity is sensible (e.g. vocal hit -> vocal hit).
- [ ] At least one candidate is "good enough to replay".

## Baseline Runs
### Run 2026-02-09
- Seed count: 20
- Candidate limit: 5
- Coverage: 100% (20/20)
- Good candidate rate (threshold 0.60): 100%
- Mean Top1 score: 80%
- MeanScore@5: 75%
- Seed panel score snapshot: 80%
- Hit@3: N/A (labelled relevance set not prepared yet)
- Hit@5: N/A (labelled relevance set not prepared yet)
- Notes: In-app runner output captured from current heuristic v1 pipeline.

## Run Template
```md
### Run YYYY-MM-DD
- Seed count:
- Candidate limit:
- Hit@3:
- Hit@5:
- MeanScore@5:
- Notes:
```
