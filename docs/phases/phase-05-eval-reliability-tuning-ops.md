# Phase 05 - Evaluation Reliability + Tuning Ops + Explainable Transition

## Goal
Transition kalitesini yalnizca skorla degil, karar guvenilirligi + runtime saglik + tuning izlenebilirligi ile birlikte yonetmek.

## Status Snapshot (2026-03-03)
- [x] Phase 05 dokumani acildi.
- [x] Runtime gate gercek ornek uretimi aktif.
- [x] Bottom-3 diagnostic bundle aktif.
- [x] Explainability UI satiri aktif.
- [x] Real dataset mini-run quality gate aktif.

## Scope
- In scope:
  - Evaluation reliability guclendirme
  - Bottom-3 tuning otomasyonu
  - Transition smoothness ve skip/fallback policy iyilestirmesi
  - Retrieval rerank cesitlilik/similarity baskilama
  - UX explainability + feedback loop
  - Quality gate sertlestirme
- Out of scope:
  - Yeni playback backend migration
  - Raw DSP (stem separation, pitch-shift, mastering)

## Public API / Interface Degisiklikleri

### Types
- [x] `BenchmarkRunMeta` tipine alan ekle:
  - [x] `seedSetHash: string`
  - [x] `scoringVersion: string`
  - [x] `analysisVersion: string`
  - [x] `runMode: "synthetic" | "real"`
  - [x] `runtimeSampleCount: number`
- [x] `TransitionDecisionExplain` tipi ekle:
  - [x] `topReasons: string[]`
  - [x] `gateStatus: "pass" | "fail"`
  - [x] `skipReason?: string`
- [x] `BottomSeedDiagnostic` tipi ekle:
  - [x] `trackId`
  - [x] `candidateBreakdown[]`
  - [x] `gateFailDistribution`
  - [x] `recommendedActions[]`

### Service/CLI
- [x] `runBaselineEvaluation` cikti metadatasina yeni alanlari ekle.
- [x] `buildBottomSeedDiagnosticBundle(input)` helper ekle.
- [x] `tuning:loop` CLI'ya `--diagnostic-bundle-out <json>` parametresi ekle.
- [x] `pipeline:quality` akisina `real mini-run` adimi ekle.
- [x] `benchmark-before-after` raporuna `runMode` ve `runtimeSampleCount` ozeti ekle.

### UI
- [x] Transition panelde secilen aday icin `Neden bu aday?` satiri ekle.
- [x] History ekranina `skip reason trend` ve `son 20 gecis kalite trendi` kartlari ekle.
- [x] Gecis sonrasi hizli feedback (`iyi / idare eder / kotu`) ekle.

## Checklist (Chronological)

### M0 - Baseline Contract Freeze
- [ ] Phase 04 threshold/default degerlerini Phase 05 baslangic referansi olarak sabitle.
- [x] Scope kuralini sertlestir: farkli `scopeId` ile karsilastirmayi hard-fail yap.
- [x] Benchmark artifact schema version alanini arttir.

### M1 - Evaluation Reliability
- [x] Runtime gate icin minimum gercek ornek sayisi kurali ekle (`minRuntimeSamples`).
- [x] `synthetic` ve `real` run ayrimini artifact ve rapora yaz.
- [x] `seedSetHash` hesaplamasini benchmark kaydina zorunlu ekle.
- [x] Runtime metrik eksiginde net fail reason ve aksiyon mesaji uret.

### M2 - Bottom-3 Diagnostic Automation
- [x] Her baseline sonrasi otomatik Bottom-3 secimi yap.
- [x] Her Bottom-3 seed icin candidate score breakdown snapshot kaydet.
- [x] Gate fail dagilimini seed bazinda raporla.
- [x] Tuning aksiyon onerilerini confidence ile sirala.
- [x] `tuning:loop` search sonucunda `best trial` icin diagnostic bundle uret.

### M3 - Transition Smoothness & Decision Policy vNext
- [x] Final score yanina `smoothnessScore` ekseni ekle.
- [ ] Karar politikasi: dusuk guvende gecis yerine skip + fallback anini zorunlu kil.
- [ ] Icerik-farkindali envelope ayari ekle (vocal-heavy, bass-heavy, build-up).
- [ ] Skip kararlarinin reason taxonomy'sini standardize et.

### M4 - Retrieval & Rerank Precision
- [x] Near-duplicate target moment baskilama kurali ekle.
- [x] Rerank katmanina `diversity budget` ekle.
- [x] Benzer aday yiginilmasinda top-N cesitlilik koruma uygula.
- [x] Retrieval quality raporuna cesitlilik metrigi (unique target ratio) ekle.

### M5 - Explainability & Feedback Loop
- [x] UI'da `why chosen` 3-4 nedenlik insan-okunur ozet uret.
- [x] Gecis sonrasi tek tik feedback kaydet.
- [x] Feedback'i relevance/tuning sinyaliyle birlestiren map tasarla.
- [x] History ekranina fail reason toplulastirma karti ekle.

### M6 - Quality Gates & CI Hardening
- [x] `pipeline:quality` icine real dataset mini-run adimi ekle.
- [x] Scoring/penalty degisimi oldugunda before/after raporu zorunlu kil.
- [ ] Regression + runtime gate birlikte PASS olmadan tuning merge edilmesin.
- [x] OSS guard + retrieval gate + transition gate adimlarini zorunlu zincirde tut.

## Test Plani

### Unit
- [x] `seedSetHash` deterministic hesap testi.
- [x] `runMode` siniflandirma testi (`synthetic`/`real`).
- [x] `BottomSeedDiagnostic` formatter ve siralama testi.
- [x] `smoothnessScore` edge-case testleri.
- [x] near-duplicate suppression testi.
- [x] diversity budget testleri.

### Smoke
- [x] `transition-evaluation.smoke.test.ts`:
  - [x] runtime sample yetersizligi dogru fail reason doner.
  - [x] scopeId mismatch hard fail olur.
- [x] `tuning-loop-cli.smoke.test.ts`:
  - [x] diagnostic bundle artifact olusur.
  - [x] best trial validation gate sonucunu yazar.
- [x] `retrieval-index.smoke.test.ts`:
  - [x] diversity/duplicate kurallari aktifken recall kabul sinirinda kalir.
- [x] `quality-guardrails.smoke.test.ts`:
  - [x] real mini-run adimi pipeline sirasinda zorunlu.

### Acceptance
- [ ] Hit@3/Hit@5 dususu olmadan tuning yapilabilmeli.
- [x] Runtime gate gercek ornekle PASS/FALL kararini uretebilmeli.
- [x] Bottom-3 icin otomatik diagnostic bundle her run'da cikmali.
- [x] UI `why chosen` ve `skip reason` bilgisi gozle gorulur olmali.
- [x] `pipeline:quality` tek komutta tum zorunlu gate'leri gecmeli.

## Risk & Mitigation
- [ ] Risk: Fazla gate nedeniyle gecis sayisi asiri dusebilir.
- [ ] Mitigation: threshold kalibrasyonu + controlled rollout.
- [ ] Risk: Real mini-run CI suresini uzatir.
- [ ] Mitigation: kucuk sabit fixture dataset + zaman limiti.
- [ ] Risk: Feedback verisi gurultulu olabilir.
- [ ] Mitigation: feedback'i tek basina degil benchmark sinyalleriyle agirliklandir.

## Defaults (Phase 05 Baslangic)
- [x] `minRuntimeSamples = 10`
- [x] `realMiniRunSeedCount = 10`
- [x] `bottomSeedCount = 3`
- [x] `whyChosenReasonCount = 3`
- [x] `diversityBudgetTopN = 5`
- [ ] `fallbackOnLowConfidence = true`

## Uygulama Notlari (karar tamamlayici)
1. Bu faz mevcut kodu degistirmeden once dokuman ve schema kontratini netlestirme odakli acilmalidir.
2. `scopeId + seedSetHash + runMode` uclusu olmadan benchmark karsilastirmasi yapilmamalidir.
3. `pipeline:quality` sonraki fazlarda da tek zorunlu giris komutu olarak korunmalidir.
4. Phase 05 tamamlandiginda `USAGE.md` aktif takip maddeleri bu faz checklist'i ile birebir senkronize edilmelidir.

## Varsayimlar ve Secilen Defaultlar
1. Varsayim: mevcut Phase 04 gate degerleri Phase 05 baslangic referansi olarak korunacak.
2. Varsayim: runtime gate kararinda synthetic run tek basina yeterli kabul edilmeyecek.
3. Varsayim: Bottom-3 odakli tuning ana operasyon modeli olarak devam edecek.
4. Varsayim: yeni UI geri bildirimleri hafif ve tek tikli olacak, ek form gerekmeyecek.
