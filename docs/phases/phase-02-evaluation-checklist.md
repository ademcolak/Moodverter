# Phase 02 Evaluation Checklist

## Purpose
Track baseline transition quality while iterating on moment matching and scoring.

## Status Snapshot (2026-02-19)
- In-app baseline supports both `Seed Baseline` and `Tum Seed Baseline`.
- Relevance labels are persisted and consumed by metrics (`Hit@3`, `Hit@5`).
- Baseline run history is persisted locally and latest runs are visible in UI.
- Baseline output includes `Bottom-3 seed` summary for low-performance tracking.
- Regression warning is surfaced when same-scope `Hit@3/Hit@5` drops versus previous run.
- Optional hard regression gate can reject a tuning run when same-scope Hit@K drops.
- Transition panel supports source moment pinning and quick `A/B` preview listening.
- Label quality gate enforces minimum relevant target count per seed before baseline runs.
- Seed secimi manuel degil; calan sarki otomatik seed olarak kullaniliyor.
- Candidate relevance etiketlemesi arka planda otomatik tamamlanmaya odakli.
- Evaluation satirlarinda ham track ID yerine kisa track adi ozeti gosteriliyor.
- Baseline sonucu tek satirlik ozet + net gate satirlariyla daha kisa raporlaniyor.
- Baseline sonucu `Bottom-3` seed icin otomatik tuning action onerileri uretiyor.
- Benchmark run sonucu tuning action'lari onceki run ile karsilastirip validation ozeti veriyor.
- Benchmark set aktifken seed listesi `ready + label gate` kosuluyla otomatik korunuyor.
- Latest Kaggle parity run indicates metric flow is healthy, but sample size is too small for strong conclusions.

## Seed Set
- Minimum 10 seed tracks
- Include mixed genres and vocal/percussive-heavy examples
- Each seed track should have at least 5 analyzed target tracks

## Metrics (Baseline v1)
- `Hit@3`: Is at least one relevant transition in top 3?
- `Hit@5`: Is at least one relevant transition in top 5?
- `MeanScore@5`: Mean `finalScore` for top 5 candidates

## Labeled Relevance Workflow
- Open Transition panel and play any track (playing track becomes active seed).
- Relevance labels are filled from transition candidates automatically in background.
- Baseline runner automatically consumes these labels and reports `Hit@3` / `Hit@5`.
- If no labels exist, `Hit@3` and `Hit@5` are shown as `N/A`.

## Manual Listening Checklist (per seed track)
> Not: Checklist alanı UI'dan gecici olarak kaldirildi. Asagidaki maddeler manuel QA rehberi olarak korunur.

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

### Run 2026-02-10
- Seed count: 20
- Candidate limit: 5
- Coverage: 100% (20/20)
- Good candidate rate (threshold 0.60): 100%
- Mean Top1 score: 76%
- MeanScore@5: 70%
- Seed panel score snapshot: 72%
- Hit@3: N/A (labelled seed yok)
- Hit@5: N/A (labelled seed yok)
- Labelled seed count: 0
- Notes: UI snapshot uzerinden kaydedildi; run scope tum seed set.

### Run 2026-02-10 (Kaggle, heuristic v1 parity)
- RunAt (UTC): 2026-02-10T13:47:30.785614+00:00
- Seed count: 5
- Candidate limit: 5
- Coverage: 100% (5/5)
- Good candidate rate (threshold 0.60): 100%
- Mean Top1 score: 65%
- MeanScore@5: 62%
- Hit@3: 100%
- Hit@5: 100%
- Labelled seed count: 3
- Notes: Kucuk sample set (5 seed, 3 labelled seed). Sonuc optimistic olabilir; karar icin daha buyuk labelled set gerekli.

## Run Template
```md
### Run YYYY-MM-DD
- Seed count:
- Candidate limit:
- Labelled seed count:
- Hit@3:
- Hit@5:
- MeanScore@5:
- Notes:
```

## Immediate Next Step (Impact-First, Sure Bagimsiz)
- Expand labelled seeds to at least 10 before changing score weights.
- Enforce minimum 2 relevant target labels per seed to reduce metric noise.
- Freeze a benchmark seed set and rerun it after every scoring/penalty change.
- Track and compare bottom 3 seeds across runs to guide penalty/weight tuning.
- Persist each baseline run as an artifact (`runAt`, scope, Hit@3, Hit@5, MeanScore@5, notes).
- Add a regression gate: reject tuning changes if benchmark Hit@3 or Hit@5 drops.
- Attach score breakdown snapshots for failure cases in every tuning iteration.
- Keep benchmark seed pool wide enough so auto-maintained set can stay at 10.
- Validate tuning action recommendations against benchmark history before every weight update.
