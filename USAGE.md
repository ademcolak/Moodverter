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
pnpm typecheck
pnpm build
pnpm smoke:test
```

### Evaluation progress raporu (opsiyonel)
```bash
pnpm eval:report -- --input /path/to/eval-report-input.json
```

`eval-report-input.json` icerik ornegi:
```json
{
  "seedTrackIds": ["seed-a", "seed-b"],
  "requiredRelevantTargetsPerSeed": 2,
  "analysisStates": {
    "seed-a": { "status": "ready", "version": 2, "updatedAt": "2026-02-17T00:00:00.000Z" },
    "seed-b": { "status": "pending", "version": 2, "updatedAt": "2026-02-17T00:00:00.000Z" }
  },
  "relevanceMap": {
    "seed-a": ["target-1", "target-2"],
    "seed-b": ["target-3"]
  },
  "manualChecklistMap": {
    "seed-a": {
      "transitionSmooth": true,
      "timingAligned": true,
      "loudnessAcceptable": true,
      "eventContinuity": true,
      "replayWorth": true,
      "updatedAt": "2026-02-17T00:00:00.000Z"
    }
  }
}
```

## 4) Hızlı Manuel Doğrulama

1. Uygulamayı aç ve YouTube track ekleme alanına bir video linki gir.
2. Eklenen şarkının otomatik çaldığını doğrula.
3. Arama kutusundan bir şarkı bul, sonuçtan çal ve kütüphaneye ekle.
4. Kütüphaneden bir şarkı sil ve listenin güncellendiğini doğrula.
5. Play/Pause/Next/Previous/Seek kontrollerinin çalıştığını doğrula.
