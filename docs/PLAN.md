# Moodverter Genel Plan (YouTube + Perfect Transition)

> Son güncelleme: 11 Şubat 2026
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
- [x] Smoke test senaryolarını kodlaştırma.

### Phase 02 - Transition Graph
- [x] Transition type/model şemaları.
- [x] Analysis queue + state persistence.
- [x] Heuristic node extraction pipeline v1.
- [x] Top-N candidate retrieval + scoring.
- [x] Transition adaylarını seed bazlı UI'da görünür kılma.
- [x] Baseline metric yardımcıları + evaluation checklist.
- [x] Curated seed set ile ilk baseline sonuçlarını kaydetme.
- [x] Labeled relevance akışı (`Relevant/Unlabel`) + local persistence.
- [x] Baseline çıktısına `Hit@3` / `Hit@5` entegrasyonu.
- [x] Baseline scope ayrımı: `Seed Baseline` ve `Tum Seed Baseline`.

### Phase 03 - Impact-First Uplift (Sure Bagimsiz)
- [ ] Scoring v1 icin minispec hazirla: formuller, sinir durumlari, pseudocode, test ornekleri.
- [x] `scoreTransition` icin aciklama/diagnostic cikti modeli ekle (`why this candidate?`).
- [ ] Dusuk performansli seed'ler icin kalici "Bottom-3 seed" takip akisi tanimla.
- [ ] Hard-negative odakli rerank adimi ekle (aynı hedef/aynı event tekrarini cezalandir).
- [ ] Source moment pinleme + A/B dinleme akisi ekle (`A@t1` ve `B@t2` hizli karsilastirma).
- [x] Baseline run gecmisini yerel olarak sakla (run artifact + once/sonra karsilastirma).
- [ ] Metrik regresyon kapisi tanimla (Hit@3/Hit@5 dususu oldugunda tuning'i reddet).
- [ ] Relevance labeling kalitesini artir: seed basina min 2 relevant hedef zorunlulugu.
- [ ] Transition analiz versiyonlama politikasini netlestir (`ANALYSIS_VERSION` artinca otomatik reanalysis).
- [ ] YouTube/yt-dlp hata siniflarini tek modelde topla ve UI hata metinlerini standardize et.
- [x] `smoke:test` scriptini Node surumlerinden bagimsiz calisacak sekilde duzelt.
- [ ] Rust <-> TypeScript kontratini netlestir (invoke response schema + hata kodu sozlesmesi).

## Durum Özeti (2026-02-10)
- YouTube core smoke testleri eklendi; kalite kapilarinda `lint`, `tsc`, `build` geciyor.
- Transition değerlendirme katmanında relevance label tabanlı metrik akışı aktif.
- İlk Kaggle parity run dokümana işlendi (küçük örneklem: 5 seed / 3 labelled).
- Kritik öğrenim: küçük örneklemde metrikler optimistic; karar için daha büyük labelled set gerekiyor.
- `smoke:test` komutunda ortama bagli yol sorunu gorulebiliyor (Node v25 ile gozlemlendi); backlog'a alindi.

## Next
### 1) Evaluation güvenilirliğini artır
- Labelled seed sayısını en az 10'a çıkar.
- Seed başına minimum 2 relevant target etiketi topla.
- `Seed Baseline` ile düşük performanslı seedleri netleştir.

### 2) Scoring tuning (hata çözümü odaklı)
- En düşük 3 seed için score breakdown analizi yap.
- `eventMatch` / `artifactPenalty` ağırlıklarını kontrollü ayarla.
- Her tuning sonrası aynı seed set ile tekrar baseline çalıştır.

### 3) Kalite ve urun etkisi yuksek teknik kaldiraclar
- Scoring minispec + test fixture setini kodla birebir hizala.
- Baseline run history + regresyon gate mekanizmasini devreye al.
- Hata siniflama/mesaj standardini provider ve transition katmanina uygula.

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
