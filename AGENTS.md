# Moodverter Agent Guide

## Amaç
Bu repo, YouTube odakli playback + transition quality iterasyonu icin kullanilir.
Ana hedef: `A@t1 -> B@t2` gecis kalitesini olculebilir sekilde iyilestirmek.

## Guncel Urun Akisi (19 Subat 2026)
- Kullanici kutuphane satirina tiklayarak sarkiyi calar.
- Calan sarki otomatik seed kabul edilir (manuel seed secimi yok).
- Transition paneli adaylari bu kaynaga gore hesaplar.
- Source moment pinleme (`Pinle`, `Simdiki Ani Al`, `Oto`) opsiyoneldir.
- Aday hedef icin warmup/prefetch metadata hazirligi otomatik yapilir.
- Otomatik transition tetigi uygun anda hedef sarkiya gecer.
- Auto transition lead suresi son gecis gecikmesine gore dinamik ayarlanir.

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
- Relevance map label kalitesi yetersizse benchmark kosusu yapilmaz.
- Manual checklist UI'da yok; subjektif dinleme notlari manuel QA adiminda tutulur.

## Değişiklik Politikası
- Scoring/formul degisikligi yapildiginda smoke testler zorunlu.
- Baseline metrik davranisini etkileyen degisiklikte yeni/duzenlenmis test eklenmeli.
- Scope bazli karsilastirmalarda `scopeId` korunmali (farkli benchmark setleri birbirine karismamali).
- Subjektif ses kalitesi disindaki kontroller once otomasyonla dogrulanmali.

## Son Donemde Yapildi
- Kutuphane UI sadeleştirildi (satira tikla -> oynat).
- Manuel seed secimi ve checklist paneli kaldirildi.
- Otomatik seed + otomatik transition akisina gecildi.
- Transition paneli `resize-y` ile yukseklik degistirebilir hale getirildi.
- Player init timeout/fallback + provider init lock ile sonsuz "hazirlaniyor" riski azaltildi.
- Eval progress satirlarinda ham ID yerine daha okunur track adi ozeti kullanildi.
- Transition gecisinde start-time cue (hedef zamaniyla direkt yukleme) aktif edildi.
- Transition hedefi icin warmup/prefetch metadata hazirligi eklendi.
- Gecis aninda loudness envelope + otomatik compensation eklendi.
- Baseline ozeti kisaltildi ve `Bottom-3` icin tuning action onerileri eklendi.

## Sonraki Oncelikler
- Benchmark seed kapsamini buyutmek (en az 10 labeled seedin surekli korunmasi).
- Bottom-3 tuning action'lariyla agirlik tuning denemelerini run bazli karsilastirmak.
- Tek-player limitinde algilanan gecisi daha da yumusatmak icin overlap/crossfade deneyleri.
