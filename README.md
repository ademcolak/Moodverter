# Moodverter

Moodverter, YouTube kütüphanesi üzerinde çalışan ve çalan şarkıdan bir sonraki şarkıya `A@t1 -> B@t2` otomatik geçiş deneyen masaüstü uygulamasıdır.

## Mevcut Durum (20 Şubat 2026)

- YouTube linki ile şarkı ekleme
- YouTube araması ile şarkı bulma/ekleme
- Kütüphanede satıra tıklayarak direkt oynatma
- Çalan şarkıyı otomatik kaynak (seed) kabul etme
- Source moment pinleme (`Pinle`, `Simdiki Ani Al`, `Oto`)
- Geçiş anında otomatik hedefe atlama (autopilot transition)
- Geçiş hedefi için warmup/prefetch metadata hazırlığı
- Start-time cue ile hedef zamana direkt yükleme
- Geçiş anında loudness envelope + otomatik volume compensation
- Geçiş öncesi pre-duck handoff (pseudo-crossfade hissi)
- Geçişte dinamik envelope (loudness-farkina gore attack/settle/release)
- Geçişten hemen önce kisa pre-switch duck lead (daha yumuşak handoff)
- Adaptif auto-transition lead (son geçiş gecikmesine göre)
- Transition panelinde sürükleyerek yükseklik ayarlama (`resize-y`)
- Player init için timeout + hata fallback (sonsuz "Player hazirlaniyor..." beklemesini azaltma)
- Baseline/benchmark metrik akışı (`Hit@3`, `Hit@5`, regression gate)
- Benchmark runtime metrikleri (`Latency p95`, `Stall`, `Drop`)
- Benchmark runtime gate (`p95`, `Stall`, `Drop`, minimum ornek)
- Runtime gate esiklerini son auto-transition verisine gore kalibre etme
- Benchmark panelinde runtime threshold drift ozeti (son kosulara gore trend)
- Kısa baseline özeti + `Bottom-3` için tuning action önerileri
- Benchmark run’larında tuning validation özeti/gate
- Benchmark seed setini otomatik bootstrap + koruma (`ready + label gate`, min 10)
- Scoring v2 (tempo-ratio + harmonic compatibility)
- Event taxonomy genişletmesi (`build-up`, `bass-hit`) + gelişmiş hard-negative rerank çeşitliliği
- Retrieval katmanında ANN prototipi (hnswlib-node opsiyonel, brute-force fallback)

## Yapıldı

- [x] Analysis queue + state persistence
- [x] Heuristic node extraction v1
- [x] Candidate scoring ve diagnostic çıktısı
- [x] Baseline history + regression gate
- [x] Relevance map local persistence
- [x] Seed seçimi yerine çalan şarkıdan otomatik seed akışı
- [x] Kütüphane UI sadeleştirme (tek tıkla oynatma)
- [x] Checklist/ID gürültüsünü azaltan durum görünümü

## Aktif Backlog

Kaynak: `docs/PLAN.md` altındaki `Next` bölümü.

- [ ] Labelled seed sayısını en az 10 seviyesinde sürekli korumak
- [ ] Seed başına minimum 2 relevant target etiketini korumak
- [ ] Düşük performanslı (`Bottom-3`) seed’lerde score breakdown odaklı tuning döngüsünü sürdürmek
- [ ] Her scoring/penalty değişikliğinden sonra benchmark baseline + regression gate çalıştırmak

## Operasyon Kuralları

- Benchmark baseline koşusu regression gate ile çalışmalıdır.
- `Hit@3` veya `Hit@5` düşerse tuning değişikliği kabul edilmez.
- Benchmark değerlendirmesi aynı seed seti ve aynı `scopeId` ile karşılaştırılmalıdır.
- Benchmark set en az `10` seed olmalı; seed başına en az `2` relevant target etiketi olmalı.
- Benchmark set aktifken `ready + label gate` sağlanmadan karar koşusu yapılmamalıdır.
- Label coverage yetersizse benchmark koşusu karar amacıyla kullanılmamalıdır.
- Benchmark seed havuzu, otomatik korumanın `>=10` eligible seed seviyesini sürdürecek kadar geniş tutulmalıdır.
- Her tuning turunda `Bottom-3` seed’ler score breakdown ile incelenmelidir.
- Tuning action önerileri benchmark geçmişi ile doğrulanmadan ağırlık/penalty güncellemesi kalıcılaştırılmamalıdır.
- Her scoring/penalty değişikliğinden sonra benchmark baseline + regression gate tekrar çalıştırılmalıdır.
- Runtime gate (`Latency p95`, `Stall`, `Drop`) bozulursa tuning reddedilmelidir.
- Scoring/formül değişikliğinde smoke testler zorunludur; pratik varsayılan komut `pnpm run pipeline:quality` olmalıdır.
- Baseline metrik davranışını etkileyen değişikliklerde test eklenmeli/güncellenmelidir.
- Subjektif ses kalitesi dışındaki kontroller önce otomasyonla doğrulanmalıdır.
- Manual checklist UI’da olmasa da geçiş kalitesi subjektif QA adımında dinleme ile doğrulanmalıdır.
- `.smoke-dist` derleme artefaktı olarak git takibi dışında tutulmalıdır.
- Dış kaynak kod/model referansı eklendiğinde `docs/oss/source-registry.json` güncellenmeli ve `pnpm run oss:guard` geçmelidir.

## Hızlı Başlangıç

```bash
pnpm install
pnpm tauri dev
```

Not: Tauri geliştirme için Rust kurulu olmalıdır.

## Kalite Komutları

```bash
pnpm run pipeline:quality
pnpm run qa:auto
pnpm run oss:guard
pnpm run dataset:pipeline -- --config ./configs/dataset-pipeline.example.json
pnpm run tuning:loop -- --input <json> --output <json>
pnpm run runtime:drift-report -- --input <json> --output <json>
pnpm run smoke:tuning-loop-dry-run
pnpm run smoke:test
pnpm run smoke:regression-gate
pnpm run smoke:retrieval-gate
```

Dataset kullanim notu:
- `dataset:pipeline` komutu dataset dosyasini uretir (`dataset/output/playlist.moodverter.json`).
- Uygulamada `Dataset JSON Yukle` butonu ile bu dosya kutuphaneye import edilir (otomatik degil).
- `.smoke-dist` klasoru derleme artefaktidir; git takibi disinda tutulmalidir.

## Plan ve Faz Dokümanları

- [`docs/PLAN.md`](docs/PLAN.md)
- [`docs/phases/phase-01-youtube-core.md`](docs/phases/phase-01-youtube-core.md)
- [`docs/phases/phase-02-transition-graph.md`](docs/phases/phase-02-transition-graph.md)
- [`docs/phases/phase-03-scoring-minispec.md`](docs/phases/phase-03-scoring-minispec.md)
- [`docs/phases/phase-04-transition-quality-v3.md`](docs/phases/phase-04-transition-quality-v3.md)
