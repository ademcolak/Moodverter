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
7. İstersen source moment ayarı yap:
8. `Pinle`: slider konumunu kullan.
9. `Simdiki Ani Al`: o anki playback zamanını al.
10. `Oto`: pinlemeyi kaldır.

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
- [x] Baseline özetinin kısa, aksiyon odaklı hale getirilmesi
- [x] Bottom-3 seed için tuning action önerileri

## 5) Kalite Komutları

Tek komut (önerilen):

```bash
pnpm run qa:auto
```

Ayrı çalıştırma:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm smoke:test
pnpm smoke:regression-gate
```

## 6) Kalan İşler

- [ ] Benchmark seed setinde sürekli en az 10 labeled seed korunması
- [ ] Bottom-3 tuning action sonuçlarının run'lar arasında otomatik kıyaslanması
- [ ] Tek-player limiti için ileri düzey geçiş yumuşatma (overlap/crossfade)
