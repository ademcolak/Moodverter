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

Tek komut (onerilen):
```bash
pnpm run qa:auto
```

Ayrik komutlar:
```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm smoke:test
pnpm smoke:regression-gate
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

## 4) Kalan Minimum Manuel Test

1. Transition panelinden bir adayi `A/B` ile dinle.
2. Gecisin subjektif olarak kirik/sert olup olmadigini kontrol et (otomasyonda dogrudan olculemez).
3. Sonuca gore ilgili seed icin manual listening checklist'i isaretle.

## 5) Benchmark Seed Akışı (Phase 03)

1. Transition panelinde `Benchmark Olustur` ile ilk 10 hazır analizli seed'i benchmark sete al.
2. Gerekirse kütüphane satırındaki `Bench+ / Bench-` ile seed seti manuel düzelt.
3. `Sonraki Eksik Seed` ile label/checklist/analiz eksiği olan seed'leri sırayla tamamla.
4. Benchmark sette her seed için en az 2 relevant target etiketle.
5. `Benchmark Baseline` çalıştır; bu akış regression gate'i zorunlu uygular.
