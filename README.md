# Moodverter

Moodverter, YouTube'dan şarkı bulup çalan ve seçilen şarkıya en iyi uyumlu geçiş noktalarını bulan bir masaüstü widget'ıdır.
Şu an kod tabanı YouTube core playback üzerinde stabil tutuluyor; sıradaki ana hedef moment-level transition discovery.

## Mevcut Özellikler

- YouTube linki yapıştırarak hızlı şarkı ekleme
- YouTube arama sonuçlarından şarkı seçip çalma
- Yerel kütüphaneye ekleme/silme
- Temel oynatma kontrolleri: play/pause/next/previous/seek
- Tauri tabanlı macOS/Windows masaüstü uygulaması

## Hedeflenen Özellikler

- Verilen şarkı için `A@t1 -> B@t2` geçiş adayları üretme
- Moment graph tabanlı eşleşme (event + embedding + ritim/loudness uyumu)
- Top-N transition önerileri ve skor bazlı sıralama

## Transition Geliştirme Durumu

- [x] Analysis queue + state altyapısı
- [x] Heuristic node extraction (v1)
- [x] Candidate scoring API
- [x] Seed track secimi ve top transition adaylarini UI'da gosterim
- [x] Aday satirindan hedef ana direkt cal/seek aksiyonu
- [x] In-app baseline evaluation runner (coverage/top score)
- [x] Curated seed set ile kalite baseline ölçümü

## Hızlı Başlangıç

```bash
pnpm install
pnpm tauri dev
```

Notlar:
- Tauri geliştirme için Rust kurulu olmalıdır.

## Komutlar

```bash
pnpm dev
pnpm tauri dev
pnpm lint
pnpm build
```

## Plan

Genel yol haritası ve backlog kaynağı:

- [`docs/PLAN.md`](docs/PLAN.md)
- [`docs/phases/phase-01-youtube-core.md`](docs/phases/phase-01-youtube-core.md)
- [`docs/phases/phase-02-transition-graph.md`](docs/phases/phase-02-transition-graph.md)
- [`docs/phases/phase-02-evaluation-checklist.md`](docs/phases/phase-02-evaluation-checklist.md)
