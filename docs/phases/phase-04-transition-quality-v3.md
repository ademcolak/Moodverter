# Phase 04 - Transition Quality v3 + Ambience Effect

## Goal
Gecis kalitesini "en iyi aday" yerine "guvenilir iyi aday" mantigiyla secmek ve gecis anina daha yumusak/ambiyansli bir efekt kazandirmak.

## Status Snapshot (2026-03-02)
- [x] Scoring v2 + diagnostic driver aktif.
- [x] Warmup/prefetch + start-time cue aktif.
- [x] Pre-duck + dinamik envelope aktif.
- [x] Runtime gate (Latency/Stall/Drop) benchmark akisinda aktif.
- [x] Hard gate + confidence policy aktif.
- [x] Auto-transition skip nedeni UI'da gorunur.
- [x] Ambience effect profilleri (clean/ambient/punchy) ayrik.

## Scope
- In scope:
  - Hard gate katmani (event/tempo/key/loudness)
  - Auto-transition confidence policy (score + margin)
  - Ambience effect profile katmani (volume bazli)
  - Benchmark raporuna karar sebebi/skip metrikleri ekleme
- Out of scope:
  - Raw audio DSP (EQ, pitch-shift, stem separation)
  - Tamamen yeni playback backend migration

## Pipeline (v3)
1. Candidate retrieval (mevcut)
2. Hard gate elemesi (yeni)
3. Score/rerank (mevcut + gate-aware)
4. Decision policy (yeni)
5. Transition effect profile uygulamasi (genisletme)
6. Runtime event + benchmark raporu

## API Surface (phase target)
- `applyHardGate(sourceNode, targetNode, config)`
- `decideAutoTransition(candidates, config)`
- `configureTransitionEffectProfile(profile)`
- `getTransitionEffectProfile()`

## Checklist (Chronological)

### M0 - Foundation Freeze
- [x] Mevcut v2 score agirliklarini sabitle.
- [x] Runtime gate ve regression gate davranisini baseline referansi olarak dondur.
- [x] Phase 03 fixture kontratini degistirmeden koru.

### M1 - Hard Gate Katmani
- [x] `TransitionGateResult` tiplerini ekle.
- [x] Event mismatch ve low event confidence gate'lerini uygula.
- [x] Tempo ratio / key distance / loudness jump gate'lerini uygula.
- [x] Gate fail nedenlerini aday diagnostic cikisina ekle.
- [x] Gate thresholdlarini config edilebilir yap.

### M2 - Auto Decision Policy
- [x] `decideAutoTransition` fonksiyonunu ekle.
- [x] `minTop1Score` ve `minTop1Top2Margin` kurallarini uygula.
- [x] `maxArtifactPenalty` koruma kuralini ekle.
- [x] Kurallar saglanmazsa auto transition'i skip et.
- [x] Skip nedenini runtime event ve UI ozetine yaz.

### M3 - Ambience Effect Profiles
- [x] `TransitionEffectProfile` tipini ekle (`clean`, `ambient`, `punchy`).
- [x] `clean` profilini mevcut davranisla ayni tut.
- [x] `ambient` profilinde daha uzun crossfade benzeri envelope uygula.
- [x] `punchy` profilinde daha kisa/enerjik envelope uygula.
- [x] Profil secimini provider config + UI ayarina bagla.

### M4 - Benchmark ve Raporlama
- [x] Benchmark sonucuna `autoSkipRate` metriğini ekle.
- [x] Benchmark sonucuna `top skip reasons` ozetini ekle.
- [x] Tuning validation satirinda "quality improved without gate degradation" kontrolu ekle.
- [x] Bottom-3 tuning aksiyonlarina gate-fail dagilimi ekle.

### M5 - Test ve Gate
- [x] `transition-gating.smoke.test.ts` ekle.
- [x] `transition-decision.smoke.test.ts` ekle.
- [x] `transition-evaluation.smoke.test.ts` icine v3 policy senaryolari ekle.
- [x] `pnpm run pipeline:quality` icine yeni test adimlarini dahil et.
- [x] Ayni benchmark seed set + ayni scopeId ile before/after raporunu kaydet.

## Acceptance
- Auto-transition, low-confidence adaylarda atlama yapabilmeli.
- Alakasiz gecis orani onceki baseline'a gore gozle gorulur sekilde azalmali.
- Runtime gate (`Latency p95`, `Stall`, `Drop`) bozulmamali.
- Regression gate (Hit@3/Hit@5) bozulmamali.
- Benchmark raporu skip reason + autoSkipRate gostermeli.

## Risk & Mitigation
- Risk: Gate'ler fazla sert olursa gecis sayisi duser.
  - Mitigation: thresholdlari profile-based ve kalibrasyonlu tut.
- Risk: Ambience envelope gecikme hissi yaratir.
  - Mitigation: `clean` varsayilan profil, `ambient` opsiyonel profil.
- Risk: Label kalitesi dusukse tuning yanlis yonlenir.
  - Mitigation: min 10 seed + seed basina min 2 relevant label kuralini zorunlu tut.

## Defaults
- `minTop1Score = 0.62`
- `minTop1Top2Margin = 0.06`
- `maxArtifactPenalty = 0.58`
- `minEventConfidence = 0.45`
- `maxTempoRatioDistance = 0.35`
- `maxKeyDistanceClass = 4`
- `maxLoudnessJumpDb = 9`
- Varsayilan effect profile: `clean`
