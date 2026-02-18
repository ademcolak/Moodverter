# Moodverter Agent Guide

## Amaç
Bu repo, YouTube odakli playback + transition quality iterasyonu icin kullanilir.
Ana hedef: `A@t1 -> B@t2` gecis kalitesini olculebilir sekilde iyilestirmek.

## Hızlı Komutlar
- `pnpm run qa:auto` (onerilen tek komut)
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run smoke:test`
- `pnpm run smoke:regression-gate`

## Regression Kuralı
- `Benchmark Baseline` kosusu regression gate ile calismalidir.
- Hit@3 veya Hit@5 duserse tuning kabul edilmez.

## Benchmark Prensibi
- Benchmark set en az `10` seed olmali.
- Seed basina en az `2` relevant target etiketi olmali.
- Manual listening checklist tamamlanmadan benchmark kosusu yapilmaz.

## Değişiklik Politikası
- Scoring/formul degisikligi yapildiginda smoke testler zorunlu.
- Baseline metrik davranisini etkileyen degisiklikte yeni/duzenlenmis test eklenmeli.
- Scope bazli karsilastirmalarda `scopeId` korunmali (farkli benchmark setleri birbirine karismamali).
- Subjektif ses kalitesi disindaki kontroller once otomasyonla dogrulanmali.
