# Moodverter Code Map

Bu dokumanin amaci, projeyi sifirdan okuyan birinin "nereden baslamaliyim?" sorusuna hizli cevap vermektir.
Kaynak kodun yerine gecmez; moduller, akislar ve kritik kurallari isaret eder.

## 1) Hızlı Başlangıç (Kod Okuma Sırası)

1. `src/App.tsx`
2. `src/services/transition/service.ts`
3. `src/services/providers/youtube.ts`
4. `src/services/youtube/search.ts`
5. `src/services/youtube/ytdlp.ts`
6. `src-tauri/src/ytdlp.rs`
7. `tests/transition-evaluation.smoke.test.ts`

Bu siralama, UI -> domain -> provider -> backend -> test akisini takip eder.

## 2) Ana Entry Pointler

- `src/main.tsx`: React root + `ErrorBoundary` + `App`.
- `src/App.tsx`: Uygulama orkestrasyonu (UI, autoplay transition, benchmark paneli, auto-labeling).
- `src-tauri/src/lib.rs`: Tauri app setup, tray/window davranisi, invoke command kayitlari.
- `src-tauri/src/main.rs`: Tauri entry.

## 3) Modül Haritası

### UI Katmanı
- `src/App.tsx`
  - Kütüphane/oynatma ekrani
  - Transition paneli
  - Baseline/benchmark paneli
  - Auto-transition effect zinciri
- `src/components/LibrarySearch.tsx`
  - YouTube arama kutusu + suggestion + result list
- `src/components/ErrorBoundary.tsx`
  - Runtime React hata korumasi

### Provider / Playback Katmanı
- `src/hooks/useProvider.ts`
  - Provider init + playback state polling + kontrol wrapper'lari
- `src/services/providers/youtube.ts`
  - YouTube provider implementasyonu
  - Library bridge
  - Warmup/prefetch
  - Transition handoff + volume envelope

### YouTube Entegrasyon Katmanı
- `src/services/youtube/player.ts`
  - YouTube IFrame API wrapper
  - init timeout + polling + player state normalize
- `src/services/youtube/search.ts`
  - Playlist/recent/search-history localStorage
  - Search cache
  - Search fallback zinciri
- `src/services/youtube/ytdlp.ts`
  - Tauri invoke client
  - typed error normalize
  - retry/backoff
  - engine fallback (`tauri-v1`, `tauri-legacy`, `auto`)

### Transition Domain Katmanı
- `src/services/transition/service.ts`
  - Merkezi domain servis (buyuk dosya)
  - Analysis state/node storage
  - Scoring v2
  - Candidate retrieval + rerank
  - Baseline evaluation + gates
  - Runtime calibration + drift report
- `src/services/transition/analyzer.ts`
  - Heuristic/deterministic transition node üretimi (mock-benzeri)
- `src/services/transition/retrieval-index.ts`
  - ANN prototipi (opsiyonel hnswlib) + brute-force fallback
- `src/services/transition/relevance.ts`
  - Relevant target label persistence
- `src/services/transition/benchmark-guard.ts`
  - Benchmark seed selection + gap hesaplari
- `src/services/transition/evaluation-report.ts`
  - Evaluation readiness/label gate ozet raporu
- `src/services/transition/types.ts`
  - Domain tipleri / result schema'lari

## 4) Ürün Akışı (Koddan Takip)

### A) URL / Arama -> Kütüphane -> Çalma
1. `App.tsx` handler (`handleSubmitUrl`, `handleSelectSearchResult`, `handleAddSearchResultToLibrary`)
2. `YouTubeProvider` (`addTrackFromUrl`, `addTrackToLibrary`, `play`)
3. `youtube/search.ts` local playlist persistence
4. `youtube/player.ts` IFrame playback

### B) Çalan Şarkı -> Seed -> Candidate -> Otomatik Geçiş
1. `App.tsx`: playback state'den `seedTrackId` otomatik secilir
2. `findTransitionCandidates(...)` ile adaylar hesaplanir
3. `App.tsx` effect'leri:
   - warmup effect
   - handoff prime effect
   - auto switch trigger effect
4. `YouTubeProvider.playTransitionTarget(...)`:
   - warmup
   - pre-switch duck
   - target zamanda load + seek reliability adimlari
5. `recordTransitionRuntimeEvent(...)` ile runtime event kaydi

### C) Benchmark Baseline -> Gate'ler -> Tuning Önerisi
1. `App.tsx` `handleRunBaseline('benchmark')`
2. Benchmark seed set + label gate kontrolu
3. `runBaselineEvaluation(...)`
4. Sonuc:
   - `Hit@3/Hit@5`
   - bottom-3 seed
   - tuning actions
   - regression gate
   - tuning validation gate
   - runtime gate
5. Benchmark sonucu handoff profile tuning'ine input olur (`buildHandoffProfileFromBenchmarkResult`)

## 5) Kritik Domain Kuralları (İnvariant)

- Benchmark karsilastirmalari ayni `scopeId` ile yapilmali.
- Benchmark seed seti min `10` seed hedefler.
- Seed basina min `2` relevant target label gate var.
- Runtime gate metrikleri:
  - latency p95
  - stall rate
  - drop rate
- Regression gate Hit@3 / Hit@5 dususunde fail verebilir.

Bu kurallarin büyük kismi `src/App.tsx` ve `src/services/transition/service.ts` icinde enforce edilir.

## 6) Local Persistence (Önemli Anahtarlar)

### YouTube / UI
- `moodverter_youtube_playlist`
- `moodverter_youtube_recent`
- `moodverter_youtube_search_history`

### Transition / Benchmark
- `moodverter_transition_analysis_queue`
- `moodverter_transition_analysis_states`
- `moodverter_transition_nodes`
- `moodverter_transition_baseline_runs`
- `moodverter_transition_runtime_events`
- `moodverter_transition_relevance_labels`
- `moodverter_transition_benchmark_seed_ids`

### One-time reset
- `moodverter_data_reset_20260209`

## 7) Test Haritası (Ne Neyi Koruyor?)

- `tests/transition-evaluation.smoke.test.ts`
  - baseline, Hit@K, regression gate, runtime gate, scopeId, relevance gate
- `tests/transition-scoring-fixtures.smoke.test.ts`
  - scoring v2 fixture davranisi / weight stabilitesi
- `tests/retrieval-index.smoke.test.ts`
  - retrieval recall/top1 kalite raporu
- `tests/runtime-gate-calibration.smoke.test.ts`
  - runtime threshold calibration
- `tests/runtime-threshold-drift.smoke.test.ts`
  - runtime drift raporu siniflandirmasi
- `tests/ytdlp-engine.smoke.test.ts`
  - invoke engine fallback, retry/backoff, circuit davranisi
- `tests/benchmark-guard.smoke.test.ts`
  - benchmark seed/gap helper kurallari
- `tests/tuning-loop-cli.smoke.test.ts`
  - tuning CLI artifact ve search mode
- `tests/quality-guardrails.smoke.test.ts`
  - `qa:auto` ve `pipeline:quality` script sirasinin bozulmamasi

## 8) Büyük Dosyalar / Karmaşıklık Noktaları (Bilerek Takip Edilecek)

### `src/App.tsx`
Tek dosyada su alanlari birlestiriyor:
- UI render
- autoplay transition orchestration
- benchmark/baseline UI
- auto-labeling
- dataset import

Pratik kural:
- Yeni feature eklerken mümkünse once ilgili logic'i hook veya util'e tasiyin.

### `src/services/transition/service.ts`
Tek dosyada su alanlari birlestiriyor:
- storage/hydration
- scoring
- retrieval orchestration
- baseline/gates
- runtime calibration/drift

Pratik kural:
- Yeni domain logic eklemeden once ilgili bolumu ayri dosyaya cikarmayi degerlendirin
  (`scoring`, `baseline`, `runtime-gate`, `storage` gibi).

## 9) Yeni Feature Eklerken Nereden Başlanır?

### YouTube arama / backend / fallback feature
- Baslangic: `src/services/youtube/search.ts`
- Sonra: `src/services/youtube/ytdlp.ts`
- Gerekiyorsa: `src-tauri/src/ytdlp.rs`
- Test: `tests/ytdlp-engine.smoke.test.ts`

### Transition scoring / ranking feature
- Baslangic: `src/services/transition/service.ts` (scoring + rerank)
- Tipler: `src/services/transition/types.ts`
- Test: `tests/transition-scoring-fixtures.smoke.test.ts`
- Sonra: `tests/transition-evaluation.smoke.test.ts`

### Benchmark / gate / tuning feature
- Baslangic: `src/services/transition/service.ts`
- UI: `src/App.tsx`
- Test: `tests/transition-evaluation.smoke.test.ts`, `tests/runtime-*`, `tests/benchmark-guard.smoke.test.ts`

### UI / playback flow feature
- Baslangic: `src/App.tsx`
- Provider gerekiyorsa: `src/services/providers/youtube.ts`
- Player gerekiyorsa: `src/services/youtube/player.ts`
- Test: `tests/youtube-core.smoke.test.ts`

## 10) Operasyon / Kalite Komutları (Pratik)

Onerilen tek komut:

```bash
pnpm run pipeline:quality
```

Bu komut kalite zincirini toplar:
- `qa:auto`
- `oss:guard`
- `smoke:retrieval-gate`
- `smoke:tuning-loop-dry-run`

---

Not:
- Bu dosya "living codemap" olarak tutulmali.
- Davranis/akis degisirse ozellikle bolum 3, 4, 5 ve 7 guncellenmeli.
