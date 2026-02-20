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
2. Kütüphanede bir şarkı satırına tıkla.
3. Uygulama çalan şarkıyı otomatik seed kabul eder.
4. Transition panelindeki adaylara göre otomatik geçişi uygular.
5. Geçiş öncesi hedef şarkı için warmup/prefetch hazırlığı arka planda çalışır.
6. Geçiş sırasında hedef zamanına start-time cue ile atlanır ve loudness smoothing uygulanır.
7. Geçişten hemen önce handoff pre-duck (pseudo-crossfade) uygulanır.
8. İstersen source moment ayarı yap:
9. `Pinle`: slider konumunu kullan.
10. `Simdiki Ani Al`: o anki playback zamanını al.
11. `Oto`: pinlemeyi kaldır.

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

## 5) Kalite Komutları

Tek komut (önerilen):

```bash
pnpm run pipeline:quality
pnpm run qa:auto
pnpm run oss:guard
pnpm run dataset:pipeline -- --config ./configs/dataset-pipeline.example.json
pnpm run tuning:loop -- --input <json> --output <json>
pnpm run runtime:drift-report -- --input <json> --output <json>
pnpm run smoke:tuning-loop-dry-run
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
```

## 6) Aktif Takip Maddeleri

Kaynak: `docs/PLAN.md` altındaki `Next` bölümü.

- [ ] Labelled seed sayısını en az 10 seviyesinde sürekli koru
- [ ] Seed başına minimum 2 relevant target etiketini koru
- [ ] Düşük performanslı (`Bottom-3`) seed’ler için düzenli score breakdown + tuning döngüsü yürüt
- [ ] Her scoring/penalty değişikliğinden sonra benchmark baseline + regression gate çalıştır
