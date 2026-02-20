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
- Adaptif auto-transition lead (son geçiş gecikmesine göre)
- Transition panelinde sürükleyerek yükseklik ayarlama (`resize-y`)
- Player init için timeout + hata fallback (sonsuz "Player hazirlaniyor..." beklemesini azaltma)
- Baseline/benchmark metrik akışı (`Hit@3`, `Hit@5`, regression gate)
- Benchmark runtime metrikleri (`Latency p95`, `Stall`, `Drop`)
- Kısa baseline özeti + `Bottom-3` için tuning action önerileri
- Benchmark run’larında tuning validation özeti/gate
- Benchmark seed seti aktifken otomatik kalite koruma (`ready + label gate`)
- Scoring v2 (tempo-ratio + harmonic compatibility)
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
pnpm run smoke:test
pnpm run smoke:regression-gate
pnpm run smoke:retrieval-gate
```

## Plan ve Faz Dokümanları

- [`docs/PLAN.md`](docs/PLAN.md)
- [`docs/phases/phase-01-youtube-core.md`](docs/phases/phase-01-youtube-core.md)
- [`docs/phases/phase-02-transition-graph.md`](docs/phases/phase-02-transition-graph.md)
- [`docs/phases/phase-03-scoring-minispec.md`](docs/phases/phase-03-scoring-minispec.md)
