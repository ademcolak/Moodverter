# Moodverter Genel Plan (YouTube + Perfect Transition)

> Son güncelleme: 19 Şubat 2026
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
- [x] Labeled relevance akışı + local persistence.
- [x] Baseline çıktısına `Hit@3` / `Hit@5` entegrasyonu.
- [x] Baseline scope ayrımı: `Seed Baseline` ve `Tum Seed Baseline`.

### Phase 03 - Impact-First Uplift (Sure Bagimsiz)
- [x] Scoring v1 icin minispec hazirla: formuller, sinir durumlari, pseudocode, test ornekleri.
- [x] `scoreTransition` icin aciklama/diagnostic cikti modeli ekle (`why this candidate?`).
- [x] Dusuk performansli seed'ler icin kalici "Bottom-3 seed" takip akisi tanimla.
- [x] Hard-negative odakli rerank adimi ekle (aynı hedef/aynı event tekrarini cezalandir).
- [x] Source moment pinleme + A/B dinleme akisi ekle (`A@t1` ve `B@t2` hizli karsilastirma).
- [x] Baseline run gecmisini yerel olarak sakla (run artifact + once/sonra karsilastirma).
- [x] Metrik regresyon kapisi tanimla (Hit@3/Hit@5 dususu oldugunda tuning'i reddet).
- [x] Relevance labeling kalitesini artir: seed basina min 2 relevant hedef zorunlulugu.
- [x] Transition analiz versiyonlama politikasini netlestir (`ANALYSIS_VERSION` artinca otomatik reanalysis).
- [x] YouTube/yt-dlp hata siniflarini tek modelde topla ve UI hata metinlerini standardize et.
- [x] `smoke:test` scriptini Node surumlerinden bagimsiz calisacak sekilde duzelt.
- [x] Rust <-> TypeScript kontratini netlestir (invoke response schema + hata kodu sozlesmesi).
- [x] Provider engine fallback stratejisini netlestir (`auto -> tauri native -> fallback`) ve retry/backoff davranisini yaz.
- [x] Search timeout + rate-limit korumasi ekle (graceful fallback + net UI uyari mesaji).
- [x] Konfig precedence politikasini yazili hale getir (`runtime override > env > default`).
- [x] Baseline/analysis artifact versiyon alanlarini genislet (schemaVersion + analysisVersion + scope metadata).
- [x] UI sadeleştirme: kütüphane satırına tıkla-çal akışı.
- [x] Manuel seed seçimi yerine çalan şarkıyı otomatik seed kullanımı.
- [x] Otomatik transition akışı (source moment pinleme ile birlikte).
- [x] Transition panelinde resize-y ile yükseklik kontrolü.
- [x] Player initialize için timeout + hata fallback + provider init lock.
- [x] Eval progress satırlarında ID gürültüsünü azaltma (track adı + kısa özet).

### Phase 04 - Transition Quality v3 + Ambience Effect
- [x] Hard gate + confidence policy ile alakasiz auto gecisleri filtreleme.
- [x] Auto decision policy (`minScore`, `minMargin`, `maxArtifactPenalty`) ile skip davranisi.
- [x] Ambience effect profilleri (`clean`, `ambient`, `punchy`) ve provider tarafinda uygulanmasi.
- [x] Benchmark ozetine auto-skip metrikleri (`skipRate`, `top reasons`) ekleme.
- [x] V3 policy smoke testleri (`transition-gating`, `transition-decision`, evaluation v3).
- [x] Faz dokumani: `docs/phases/phase-04-transition-quality-v3.md`.

### Phase 05 - Evaluation Reliability + Tuning Ops
- [ ] Faz dokumani: `docs/phases/phase-05-eval-reliability-tuning-ops.md`.

## Son Degisiklik Ozeti (19 Subat 2026)
### Yapildi
- Kütüphanede satıra tıklama ile direkt oynatma aktif edildi.
- `Seed`, `Bench`, checklist gibi günlük kullanımda gürültü oluşturan UI parçaları sadeleştirildi.
- Çalan şarkı otomatik seed kabul edilerek geçiş adayları bu kaynağa göre yenilenir hale getirildi.
- Otomatik geçiş tetiği erken başlatılarak bekleme hissi azaltıldı.
- Player tarafında init kilitlenmesi ve sonsuz "hazırlanıyor" durumuna karşı timeout/fallback eklendi.
- Kalite kapıları (`lint`, `typecheck`, `build`, `smoke:test`, `smoke:regression-gate`) korunmaya devam edildi.
- Geçiş hedefi için warmup/prefetch metadata hazırlığı eklendi.
- Transition geçişi start-time cue (hedef zamana direkt yükleme) ile hızlandırıldı.
- Geçiş anına loudness envelope + otomatik volume compensation eklendi.
- Geçiş öncesi handoff pre-duck (pseudo-crossfade hissi) eklendi.
- Baseline/evaluation özeti kısaltıldı ve `Bottom-3` için tuning action önerileri eklendi.
- Benchmark run sonuçlarına tuning validation özeti/gate eklendi.
- Benchmark seed seti aktifken `ready + label gate` koşuluyla otomatik koruma eklendi.
- Benchmark seed havuzu, eligible seed sayisi 10 altina dusunce hizli toparlayacak sekilde guclendirildi.
- Tuning validation cikti/gate satiri benchmark akisinda daha gorunur hale getirildi.
- Handoff envelope (`duck/ramp/hold`) benchmark bottom-seed metriklerine gore adaptif hale getirildi.
- Cok yavas aglarda startup/playback stall etkisini azaltan oynatma baslangic toparlama adimi eklendi.
- Uygulama genelindeki panel/buton metinleri daha sade ve tutarli terminolojiye cekildi.

### Yapilacak (Sprint Scope)
- Bu sprintte acik kalan zorunlu uygulama maddesi yok.
- Aktif urun/kalite takip maddeleri asagidaki `Next` bolumunde tutulur.

## Sprint Plani (Baslangic: 2026-02-17)
### Sprint 1 - Kontrat ve hata modeli
- Rust invoke response envelope: `ok | data | error`.
- Tekil hata kodu sozlesmesi: `YTDLP_BINARY_NOT_FOUND`, `YTDLP_NETWORK`, `YTDLP_RATE_LIMITED` vb.
- TypeScript tarafinda typed hata map'i + UI mesaj standardi.

### Sprint 2 - Engine/fallback
- Provider tarafinda `auto` strateji secimi.
- Hata koduna gore fallback davranislari.
- Retry/backoff sinirlari ve timeout politikalari.

### Sprint 3 - Reanalysis ve versiyonlama
- `ANALYSIS_VERSION` arttiginda stale analizleri otomatik queue'ya alma.
- Eski node/state migrate politikasini deterministic hale getirme.
- Reanalysis akisini smoke test ile guvenceye alma.

### Sprint 4 - Scoring minispec + fixture
- Scoring formulu, edge case ve pseudocode dokumani.
- Kodla birebir fixture testleri.
- Tune sonrasi benchmark run zorunlulugu.

### Sprint 5 - CI kalite kapilari
- [x] `lint`, `tsc`, `build`, `smoke:test` zorunlu kapilar.
- [x] Baseline regression gate sonucunu PR kontrolu olarak raporlama.

## Durum Özeti (2026-02-19)
- YouTube core smoke testleri eklendi; kalite kapilarinda `lint`, `tsc`, `build` geciyor.
- Transition değerlendirme katmanında relevance label tabanlı metrik akışı aktif.
- İlk Kaggle parity run dokümana işlendi (küçük örneklem: 5 seed / 3 labelled).
- Kritik öğrenim: küçük örneklemde metrikler optimistic; karar için daha büyük labelled set gerekiyor.
- Otomatik seed + otomatik transition akışı temel kullanıcı yolu haline getirildi.
- UI tarafında manuel checklist ve ID listesi gürültüsü azaltıldı.
- Player init timeout/fallback ile "hazırlanıyor" kilitlenmesi riski azaltıldı.

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
- Benchmark kararlarinda runtime gate (`Latency p95`, `Stall`, `Drop`) sonucunu metrik regression ile birlikte degerlendir.
- Tuning action onerilerini benchmark gecmisiyle dogrulamayinca agirlik/penalty guncellemesini kalici yapma.
- Scoring/penalty degisimi sonrasinda ayni benchmark seed seti + ayni `scopeId` ile baseline + regression gate kos.
- Scoring/formul degisikliklerinde `pnpm run pipeline:quality` ve ilgili smoke gate'leri zorunlu tut.

### 4) Uygulama Plani (2026-02-20)
- [x] Scoring v2: tempo-ratio (1x/0.5x/2x) toleransi + harmonic compatibility sinyalini rhythm hesabina ekle.
- [x] Scoring minispec ve fixture testlerini v2 ile birebir hizala.
- [x] OSS kaynak alimi icin registry + lisans guard otomasyonu (`pnpm run oss:guard`) ekle.
- [x] Candidate retrieval katmanina ANN index prototipi ekle (hnswlib-node, in-memory fallback ile).
- [x] Benchmark raporuna transition latency p95 + stall/drop rate metriklerini ekle.
- [x] Benchmark baseline icin runtime SLO gate ekle (p95/stall/drop + minimum ornek).
- [x] Benchmark oncesi label coverage gap listesini otomatik ve detayli (seed + eksik adet) hale getir.
- [x] Bottom-3 tuning aksiyonlarini JSON artifact olarak ureten `tuning:loop` CLI akisini ekle.
- [x] Event taxonomy genisletmesi (`build-up`, `bass-hit`) + scoring uyumluluk matrisini guncelle.
- [x] Hard-negative rerank katmanina event-family ve target-zaman yogunlugu cesitlilik cezasi ekle.
- [x] Tek-player handoff kalitesi icin dinamik transition envelope + pre-switch duck lead ekle.
- [x] `tuning:loop` icin single + search(trials/validateBestWithGates) smoke testlerini otomatiklestir.
- [x] Quality pipeline'a tuning dry-run fixture adimi ekle.
- [x] Runtime gate esiklerini son auto-transition verisiyle kalibre eden akisi ekle.
- [x] Benchmark runtime threshold drift raporunu (son kosular trendi) ekle.
- [x] Benchmark seed seti icin min 10 + auto-bootstrap koruma davranisini ekle.
- [x] CI quality gate'i tek komut (`pnpm run pipeline:quality`) ile zorunlu hale getir.

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
