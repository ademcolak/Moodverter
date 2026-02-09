# Moodverter Kullanım Kılavuzu (YouTube-Only)

Bu kılavuz, Moodverter'ın temel YouTube akışını (arama/ekleme/çalma) çalıştırmak ve doğrulamak için kısa adımları içerir.

## 1) Kurulum

```bash
pnpm install
```

## 2) Uygulamayı Çalıştırma

### Masaüstü (önerilen)
```bash
pnpm tauri dev
```

### Web önizleme
```bash
pnpm dev
```

## 3) Test ve Kalite

```bash
pnpm lint
pnpm build
```

## 4) Hızlı Manuel Doğrulama

1. Uygulamayı aç ve YouTube track ekleme alanına bir video linki gir.
2. Eklenen şarkının otomatik çaldığını doğrula.
3. Arama kutusundan bir şarkı bul, sonuçtan çal ve kütüphaneye ekle.
4. Kütüphaneden bir şarkı sil ve listenin güncellendiğini doğrula.
5. Play/Pause/Next/Previous/Seek kontrollerinin çalıştığını doğrula.
