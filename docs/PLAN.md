# Moodverter Genel Plan (YouTube + Perfect Transition)

> Son güncelleme: 9 Şubat 2026
> Kapsam: YouTube core playback + moment-level transition discovery

## Özet
Moodverter'ın ürün hedefi:
1. Kullanıcının verdiği bir şarkıyı referans alıp,
2. Bu şarkının belirli anlarıyla uyumlu geçiş anlarını diğer şarkılarda bulmak,
3. `A@t1 -> B@t2` formatında güçlü transition adayları önermek.

Temel prensip: track-to-track değil, moment-to-moment eşleşme.

## Mimari Yön
1. Ingest: şarkı ekleme (URL/arama)
2. Analysis: şarkıdan moment/anchor çıkarımı
3. Index: moment graph + embedding tabanlı aday arama
4. Ranking: geçiş skorlaması (event/timbre/rhythm/loudness/artifact)
5. Playback: önerilen geçişin uygulanması

## Now
### 1) YouTube Core stabilizasyonu (Phase 01)
- Core UI ve playback akışını stabil tut
- Hata/edge-case davranışlarını netleştir
- Temel kalite kapılarını koru

Kabul kriterleri:
- `pnpm -s lint`, `pnpm -s tsc --noEmit`, `pnpm -s build` geçer
- Link ekleme + arama + çalma + kütüphane akışı sorunsuz çalışır

### 2) Transition Graph tasarımının netlenmesi (Phase 02 design)
- Node ve edge şeması kesinleşsin
- Scoring v1 formülü kesinleşsin
- Analysis pipeline için minimum veri modeli net olsun

Kabul kriterleri:
- Phase dokümanında veri şeması + skor formülü + kabul kriterleri yazılı olur
- Uygulayıcıya açık karar bırakmayan teknik çerçeve oluşur

## Active Task List
### Phase 01 - YouTube Core
- [x] UI sadeleştirme ve playback akışı.
- [x] YouTube-only provider path.
- [x] Legacy dosya/bağımlılık temizliği.
- [ ] Smoke test senaryolarını kodlaştırma.

### Phase 02 - Transition Graph
- [x] Transition type/model şemaları.
- [x] Analysis queue + state persistence.
- [x] Heuristic node extraction pipeline v1.
- [x] Top-N candidate retrieval + scoring.
- [x] Transition adaylarını seed bazlı UI'da görünür kılma.
- [x] Baseline metric yardımcıları + evaluation checklist.
- [x] Curated seed set ile ilk baseline sonuçlarını kaydetme.

## Next
### 1) Phase 02 implementasyonu
- Analysis queue
- Moment extraction
- Embedding index
- Top-N transition candidate API

### 2) İlk kalite metrikleri
- Hit@K
- Mean transition score
- Manuel dinleme checklist sonuçları

## Later
### 1) Geçiş kalitesi iyileştirme
- Event taxonomy genişletme
- Hard-negative ve rerank geliştirmeleri
- Daha düşük artifact oranı

### 2) Playback engine iyileştirme
- Daha iyi overlap/crossfade
- Zaman hizalama hassasiyetinin artırılması

## Backlog Item Şablonu
```md
### [ID] Başlık
- Amaç:
- Girdi/Çıktı:
- Kapsam:
- Kapsam dışı:
- Teknik yaklaşım:
- Kabul kriterleri:
- Doğrulama:
```
