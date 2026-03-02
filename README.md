# Moodverter

Moodverter, YouTube kütüphanesi üzerinde çalışan bir masaüstü uygulamasıdır.
Temel fikir, şarkıları sadece track bazında değil moment bazında eşleştirmek:
`A@t1 -> B@t2`.

## Projenin Mantığı

1. Kullanıcı kütüphaneden bir şarkı çalar.
2. Çalan şarkı otomatik olarak kaynak (seed) kabul edilir.
3. Sistem geçiş için aday hedefleri bulur ve skorlar.
4. Hard gate + decision policy ile güvenilir aday seçilir (veya skip edilir).
5. Geçiş sırasında warmup/prefetch + envelope/handoff ile daha yumuşak aktarım yapılır.
6. Sonuçlar benchmark metrikleriyle ölçülür (`Hit@3`, `Hit@5`, `Latency p95`, `Stall`, `Drop`).

## Ne Yapmak İstiyoruz

- Otomatik geçişleri daha güvenilir hale getirmek (yanlış geçiş oranını azaltmak).
- Geçiş anını daha doğal hissettirmek (ambience/handoff kalitesi).
- Tuning kararlarını ölçülebilir gate’lerle vermek (regression/runtime gate).
- Düşük performanslı seed’leri (`Bottom-3`) sistematik iyileştirmek.

## Kısa Durum

- Çekirdek akış çalışıyor: link/arama ile ekleme, satıra tıklayıp oynatma, otomatik seed, aday geçişler.
- v3 kalite katmanı aktif: hard gate, auto decision policy, skip reason görünürlüğü, effect profiles.
- Benchmark ve tuning akışı aktif: baseline history, tuning validation, runtime gate/drift, before/after raporu.

## Çalışma Prensibi (Özet Kurallar)

- Benchmark karşılaştırmaları aynı seed seti + aynı `scopeId` ile yapılır.
- `Hit@3`/`Hit@5` düşerse regresyon kabul edilir.
- Runtime gate (`Latency p95`, `Stall`, `Drop`) bozulursa tuning reddedilir.
- Karar için benchmark set kalitesi korunur (min 10 seed, seed başına min 2 relevant target).

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
