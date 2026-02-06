# Faz 4: Stabilite + Algoritma + UI Hiyerarşisi + Refactor

## 1. Problem Statement (Kök Nedenler)
- YouTube `track ended` olayı tek bir güvenilir event hattından App akışına taşınmıyordu, bu yüzden `auto_discover` bazı durumlarda tetiklenmiyordu.
- `suggest` modunda öneri paneli açıldığında “akış koptu” hissi oluşuyordu; fallback autoplay davranışı yoktu.
- Queue/Discovery/Library geçişlerinde karar önceliği net bir state-machine üzerinden yürütülmüyordu.
- Discovery scoring tarafında kalite/repeat kontrolü vardı ama mood-distance etkisi zayıftı.
- UI’da Queue/History açma-kapama akışı iki ayrı bayrakla yürüdüğü için iç içelik artıyordu.
- History alanında karar kaynağı (`decisionSource`) ve algoritma sürümü (`algorithmVersion`) izlenmediği için analiz geri izlenebilirliği düşüktü.

## 2. Hedefler ve Non-Goals
### Hedefler
- YouTube doğal bitişini event-tabanlı tek akıştan yönetmek.
- `suggest` modunda sessizlik oluşmasını engellemek (countdown + fallback autoplay).
- Geçiş önceliğini sabitlemek: `Queue > Discovery > Library fallback`.
- Discovery scoring’i mood-distance + diversity + quality + repeat/cooldown cezası ile zenginleştirmek.
- UI’da side panel state-machine ile Queue/History hiyerarşisini sadeleştirmek.
- Lint/build/test kapılarını temiz geçirmek.

### Non-Goals
- Tam mimari rewrite.
- Tam görsel redesign.
- Ollama’yı zorunlu çalışma bağımlılığı yapmak.

## 3. P0-P4 Backlog (Önem Sırası)
| Öncelik | İş | Etki | Risk | Efor |
|---|---|---|---|---|
| P0 | Provider playback event hattı (YouTube `track_ended` + App event tüketimi) | Çok yüksek | Orta | Orta |
| P0 | Queue/Discovery/Library deterministik öncelik | Çok yüksek | Düşük | Düşük |
| P0 | `suggest` no-silence fallback (countdown autoplay) | Yüksek | Düşük | Düşük |
| P0 | History metadata (`decisionSource`, `algorithmVersion`) | Yüksek | Düşük | Düşük |
| P1 | Discovery scoring: mood-distance + diversity + duration + quality + repeat/cooldown | Yüksek | Orta | Orta |
| P1 | Discovery blocklist + cycle limiti + context kullanımı | Orta | Düşük | Düşük |
| P2 | Settings discovery iki seviye (temel/gelişmiş) | Orta | Düşük | Düşük |
| P2 | Discovery panel aksiyonları (`hemen çal`, `sıraya al`, `engelle`) | Orta | Düşük | Düşük |
| P2 | Queue/History tek side panel state-machine | Orta | Düşük | Düşük |
| P3 | `services/db/history.ts` ile `services/history/index.ts` birleştirme | Orta | Düşük | Düşük |
| P3 | `components/index.ts` kullanılmayan export temizliği | Düşük | Düşük | Düşük |
| P3 | Lint borcu kapatma (`useMood`, `useSpotify`, testler, youtube.search) | Orta | Düşük | Düşük |
| P4 | Telemetri genişletme (discovery decision trace event’leri) | Orta | Düşük | Orta |
| P4 | Docs polish + runbook + operasyonal checklist | Düşük | Düşük | Düşük |

## 4. API / Type Değişiklikleri
- `src/types/provider.ts`
  - Eklendi: `PlaybackEventType`, `PlaybackEvent`, `PlaybackEventListener`
  - `MusicProvider` arayüzüne eklendi: `onPlaybackEvent(listener): () => void`
- `src/hooks/useProvider.ts`
  - Expose edildi: `lastPlaybackEvent`
- `src/types/discovery.ts`
  - `DiscoverySettings` genişletildi:
    - `suggestBehavior`
    - `suggestAutoplayDelaySec`
    - `maxSuggestionsPerCycle`
- `src/services/discovery/index.ts`
  - `discoverNextTrack` sonucu zenginleşti:
    - `reason`
    - `score`
    - `decisionTrace`
  - Context destekleri:
    - `blockedTrackIds`
    - `recentYouTubeTrackIds`
    - `recentArtists`
- `src/types/history.ts`
  - Eklendi:
    - `decisionSource?`
    - `algorithmVersion?`

## 5. Test Matrisi ve Kabul Kriterleri
### Keşif Stabilite
- YouTube track doğal bittiğinde event ile `auto_discover` devam eder.
- `suggest` paneli açıkken countdown sonunda fallback autoplay çalışır (`show_with_autoplay_fallback`).

### Queue / History
- `track_ended` sonrası sıra her zaman discovery’den önce çalışır.
- History kaydında `source`, `decisionSource`, `algorithmVersion` tutulur.

### Algoritma
- Discovery scoring içinde mood-distance sinyali hesaplanır.
- Kısa pencerede aynı video tekrar seçimi cooldown/repeat cezası ile düşer.

### UI
- Queue ve History tek `sidePanel` state ile yönetilir.
- Discovery panelinde 3 aksiyon bulunur: `hemen çal`, `sıraya al`, `engelle`.
- Settings > Discovery: temel/gelişmiş ayrımı görünür.

### Regression
- `pnpm -s tsc --noEmit` geçmeli.
- `pnpm -s lint` sıfır hata/uyarı ile geçmeli.
- `pnpm -s test:run` geçmeli.
- `pnpm -s build` geçmeli.

## 6. Rollout ve Feature Flag Planı
- `discovery.suggestBehavior`
  - `show_only`
  - `show_with_autoplay_fallback`
- `discovery.suggestAutoplayDelaySec`
  - Varsayılan: 8s
- `discovery.maxSuggestionsPerCycle`
  - Varsayılan: 5
- Rollout sırası:
  1. Event hattı + queue önceliği
  2. Suggest fallback
  3. Scoring/guardrail
  4. UI sadeleştirme
  5. Refactor + temizlik

## 7. Refactor / Deprecation Listesi
- `src/services/db/history.ts`
  - Eski history API yüzeyi korunarak tek kaynak `src/services/history/index.ts` üstünden çalışacak şekilde uyumlandı.
- `src/components/index.ts`
  - Kullanılmayan exportlar kaldırıldı:
    - `NextTrack`
    - `PlayerControls`
    - `MoodDeviationDialog`
- `App.tsx`
  - Queue/History paneli iki boolean yerine tek state-machine ile yönetiliyor.

## 8. Elle Test Checklist’i
- [ ] YouTube’da bir track doğal bitince bir sonraki track akışı kesintisiz devam ediyor.
- [ ] `suggest` modunda panel açıldığında playback aniden kesilmiyor; gerekirse countdown fallback devreye giriyor.
- [ ] Discovery önerisinden `sıraya al` çalışıyor ve Queue panelinde görünüyor.
- [ ] Discovery önerisinden `engelle` sonrası aynı track tekrar önerilmiyor.
- [ ] Queue doluyken doğal track bitişinde discovery yerine queue çalıyor.
- [ ] History kaydı doğru source/decisionSource/algorithmVersion ile yazılıyor.
- [ ] Settings > Discovery > gelişmiş ayarlar değer değiştirince davranışa yansıyor.

## 9. Ollama Çalışma Politikası
- Günlük UI/stabilite geliştirmede Ollama zorunlu değil.
- Fallback zinciri Ollama kapalıyken çalışmalı.
- Algoritma kalite/tuning (özellikle embedding/LLM etkisi) doğrulamasında Ollama açık test matrisi ayrıca koşulmalı.
