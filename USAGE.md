# Moodverter Kullanım Kılavuzu (YouTube-Only)

Bu kılavuz, güncel "tek tıkla çal + otomatik transition" akışını özetler.

## 1) Kurulum

```bash
pnpm install
```

## 2) Uygulamayı Çalıştırma

Masaüstü (önerilen):

```bash
pnpm tauri dev
```

Web önizleme:

```bash
pnpm dev
```

## 3) Güncel Kullanım Akışı

1. Link ile şarkı ekle veya aramada bulup kütüphaneye al.
2. Toplu import icin once `pnpm run dataset:pipeline -- --config ./configs/dataset-pipeline.example.json` calistir.
3. Uygulamada `Dataset JSON Yukle` butonundan `dataset/output/playlist.moodverter.json` sec.
4. Kütüphanede bir şarkı satırına tıkla.
5. Uygulama çalan şarkıyı otomatik seed kabul eder.
6. Transition panelindeki adaylara göre otomatik geçişi uygular.
7. Geçiş öncesi hedef şarkı için warmup/prefetch hazırlığı arka planda çalışır.
8. Geçiş sırasında hedef zamanına start-time cue ile atlanır ve loudness smoothing uygulanır.
9. Geçişten hemen önce handoff pre-duck (pseudo-crossfade) uygulanır.
10. Düsuk guvenli kararda auto skip olur; sistem onerilen manuel gecisi panelde tek tikla sunar.
11. Transition kartlarinda confidence badge gorunur.
12. Geçiş geri bildirimi (`iyi / idare eder / kotu`) pair-level ogrenme modeline islenir.
13. İstersen source moment ayarı yap:
14. `Pinle`: slider konumunu kullan.
15. `Simdiki Ani Al`: o anki playback zamanını al.
16. `Oto`: pinlemeyi kaldır.

## 4) Yapıldı (Kullanım Tarafı)

- [x] Kütüphane satırına tıklayarak direkt oynatma
- [x] Manuel seed seçimi yerine otomatik seed
- [x] Otomatik transition tetikleme
- [x] Transition panel yüksekliğini sürükleyerek değiştirme
- [x] UI metinlerinin sadeleştirilmesi
- [x] `Checklist eksigi` satırının kaldırılması ve ID yerine şarkı adı gösterimi
- [x] Player initialize timeout/fallback ile sonsuz bekleme riskinin azaltılması
- [x] Prefetch/warmup + start-time cue ile geçiş bekleme hissinin azaltılması
- [x] Geçişte loudness envelope + otomatik compensation
- [x] Geçiş öncesi handoff pre-duck (pseudo-crossfade hissi)
- [x] Dinamik transition envelope (loudness farkına göre attack/settle/release)
- [x] Geçişten hemen önce kısa pre-switch duck lead
- [x] Baseline özetinin kısa, aksiyon odaklı hale getirilmesi
- [x] Bottom-3 seed için tuning action önerileri
- [x] Benchmark run’larında tuning validation özeti/gate
- [x] Benchmark set aktifken otomatik kalite koruma (`ready + label gate`, min 10)
- [x] Benchmark runtime gate esiklerini son auto-transition verisine gore kalibrasyon
- [x] Benchmark panelinde runtime threshold drift trend ozeti
- [x] Benchmark runtime ozet satiri (`Latency p95`, `Stall`, `Drop`)
- [x] Scoring v2 (`tempo-ratio` + `harmonic compatibility`)
- [x] Transition adayinda explainability (`Neden bu aday?`, 3-4 neden)
- [x] History ekraninda `skip reason trend` + `son 20 gecis kalite trendi`
- [x] Gecis sonrasi hizli feedback (`iyi / idare eder / kotu`)
- [x] Low-confidence fallback + manual queue suggestion akisi
- [x] Transition confidence badge + fallback reason tooltip
- [x] Pair-level feedback ogrenme modeli + TTL blacklist
- [x] Silence-aware pre-duck opsiyonu
- [x] History ekraninda "en cok skip ureten seed" ve "en cok kotu feedback alan pair" kartlari
- [x] Bottom-3 diagnostic bundle üretimi (`tuning:loop --diagnostic-bundle-out`)
- [x] `seedSetHash + runMode` metadata zorunlulugu ve karsilastirma korumasi
- [x] Retrieval quality raporuna cesitlilik metriği (`uniqueTargetRatio`)
- [x] `pipeline:quality` zincirine `Real Mini Run` adimi

## 5) Kalite Komutları

Tek komut (önerilen):

```bash
pnpm run pipeline:quality
pnpm run qa:auto
pnpm run oss:guard
pnpm run dataset:pipeline -- --config ./configs/dataset-pipeline.example.json
pnpm run tuning:loop -- --input <json> --output <json>
pnpm run tuning:loop -- --input <json> --output <json> --diagnostic-bundle-out <json>
pnpm run runtime:drift-report -- --input <json> --output <json>
pnpm run smoke:tuning-loop-dry-run
pnpm run smoke:real-mini-run
```

Ayrı çalıştırma:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm run oss:guard
pnpm smoke:test
pnpm smoke:regression-gate
pnpm run smoke:retrieval-gate
pnpm run smoke:tuning-loop-dry-run
pnpm run smoke:real-mini-run
```

## 6) Operasyon Kuralları

- Benchmark baseline koşusunu regression gate ile çalıştır.
- `Hit@3` veya `Hit@5` düşerse tuning değişikliğini kabul etme.
- Benchmark karşılaştırmalarında aynı seed setini ve aynı `scopeId` değerini koru.
- Benchmark seti `>=10` seed tut; her seed için en az `2` relevant target etiketi olmadan karar koşusu yapma.
- Benchmark set aktifken `ready + label gate` sağlanmadan karar koşusu yapma.
- Label coverage yetersizse benchmark sonucunu karar için kullanma.
- Benchmark seed havuzunu, otomatik korumanın `>=10` eligible seed seviyesini sürdürecek kadar geniş tut.
- Her tuning turunda `Bottom-3` seed’leri score breakdown ile incele.
- Tuning action önerilerini benchmark geçmişi ile doğrulamadan ağırlık/penalty güncellemesini kalıcılaştırma.
- Her scoring/penalty değişikliğinden sonra benchmark baseline + regression gate’i tekrar çalıştır.
- Runtime gate (`Latency p95`, `Stall`, `Drop`) bozulursa tuning’i reddet.
- Benchmark merge gate kararinda coverage kosulunu zorunlu tut (`coverageRate >= 0.80`).
- Scoring/formül değişikliğinde smoke testleri zorunlu çalıştır (önerilen tek komut: `pnpm run pipeline:quality`).
- Baseline metrik davranışını etkileyen değişiklikte test ekle/güncelle.
- Subjektif ses kalitesi dışındaki kontrolleri önce otomasyonla doğrula.
- Dış kaynak kod/model referansı eklersen `docs/oss/source-registry.json` güncelle ve `pnpm run oss:guard` geçir.
- Manual checklist UI’da olmasa da geçiş kalitesini subjektif QA adımında dinleme ile doğrula.
- `.smoke-dist` klasörünü derleme artefaktı olarak git takibi dışında tut.

## 7) Aktif Takip Maddeleri

Kaynak: `docs/PLAN.md` altındaki `Next` bölümü.
Detayli execution tasklist: `docs/phases/phase-05-eval-reliability-tuning-ops.md`.

- [x] Labelled seed sayısını en az 10 seviyesinde sürekli koru (benchmark auto-bootstrap + label gate guard)
- [x] Seed başına minimum 2 relevant target etiketini koru (baseline run gate + benchmark gap kontrolü)
- [x] Düşük performanslı (`Bottom-3`) seed’ler için düzenli score breakdown + tuning döngüsü yürüt (`tuning:loop` + escalation)
- [x] Her scoring/penalty değişikliğinden sonra benchmark baseline + regression gate çalıştır (`pipeline:quality` zorunlu akış)
