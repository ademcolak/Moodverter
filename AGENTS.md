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
- Otomatik gecis oncesi handoff pre-duck (pseudo-crossfade) uygulanir.
- Gecis envelope parametreleri (attack/settle/release) loudness farkina gore dinamik ayarlanir.
- Hedefe gecmeden hemen once kisa pre-switch duck lead uygulanir.
- Otomatik transition tetigi uygun anda hedef sarkiya gecer.
- Auto transition lead suresi son gecis gecikmesine gore dinamik ayarlanir.
- Benchmark seed set aktifken `ready + label gate` kosuluyla otomatik bootstrap/koruma yapilir (min 10).
- Runtime gate esikleri son auto-transition verisine gore kalibre edilir.
- Benchmark panelinde runtime threshold drift ozeti (son kosular trendi) gosterilir.

## Hızlı Komutlar
- `pnpm run pipeline:quality` (onerilen tek komut)
- `pnpm run qa:auto`
- `pnpm run oss:guard`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run smoke:test`
- `pnpm run smoke:regression-gate`
- `pnpm run smoke:retrieval-gate`
- `pnpm run smoke:tuning-loop-dry-run`
- `pnpm run tuning:loop -- --input <json> --output <json>`
- `pnpm run runtime:drift-report -- --input <json> --output <json>`
- `pnpm run dataset:pipeline -- --config ./configs/dataset-pipeline.example.json`
- Uygulamada `Dataset JSON Yukle` ile `dataset/output/playlist.moodverter.json` import edilir (otomatik degil).

## Regression Kuralı
- `Benchmark Baseline` kosusu regression gate ile calismalidir.
- Hit@3 veya Hit@5 duserse tuning kabul edilmez.
- Tuning etkisi ayni benchmark seed seti ve ayni `scopeId` ile karsilastirilmalidir.
- Runtime gate (`Latency p95`, `Stall`, `Drop`) bozuluyorsa tuning kabul edilmez.

## Benchmark Prensibi
- Benchmark set en az `10` seed olmali.
- Seed basina en az `2` relevant target etiketi olmali.
- Relevance map label kalitesi yetersizse benchmark kosusu yapilmaz.
- Benchmark set (seed listesi + `scopeId`) dondurulup tuning turlarinda sabit tutulmali.
- Benchmark set aktifken `ready + label gate` kosulu saglanmadan karar kosusu yapilmaz.
- Benchmark seed havuzu, otomatik korumanin `>=10` eligible seed seviyesini surekli koruyacagi genislikte tutulmali.
- `Bottom-3` seed listesi kosular arasi takip edilip tuning hedefi olarak kullanilmali.
- Manual checklist UI'da yok; subjektif dinleme notlari manuel QA adiminda tutulur.

## Değişiklik Politikası
- Scoring/formul degisikligi yapildiginda smoke testler zorunlu.
- Baseline metrik davranisini etkileyen degisiklikte yeni/duzenlenmis test eklenmeli.
- Scope bazli karsilastirmalarda `scopeId` korunmali (farkli benchmark setleri birbirine karismamali).
- Subjektif ses kalitesi disindaki kontroller once otomasyonla dogrulanmali.
- Her scoring/penalty degisimi sonrasinda benchmark baseline + regression gate tekrar kosulmali.
- Tuning karari verilmeden once `Bottom-3` seed failure case'leri icin score breakdown snapshot'lari incelenmeli.
- Tuning action onerileri benchmark gecmisi ile dogrulanmadan agirlik/penalty guncellemesi kalici yapilmamali.
- Kalite dogrulamada varsayilan yol `pnpm run pipeline:quality` olmalidir (tek komut).
- `.smoke-dist` derleme artefakti olarak git takibi disinda tutulur.
- Dis kaynak kod/model referansi eklendiginde `docs/oss/source-registry.json` guncellenip `pnpm run oss:guard` gecmelidir.

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
- Benchmark run'larinda tuning action dogrulama ozeti/gate eklendi.
- Benchmark seed seti icin otomatik kalite koruma (>=10 uygun seed hedefi) eklendi.
- Scoring v2: tempo-ratio + harmonic compatibility sinyalleri eklendi.
- Retrieval katmaninda ANN prototipi (hnswlib-node opsiyonel, brute-force fallback) eklendi.
- Benchmark ozetine runtime metrikleri (`Latency p95`, `Stall`, `Drop`) eklendi.
- Event taxonomy genisletildi (`build-up`, `bass-hit`) ve hard-negative rerank cesitlilik sinyalleri guclendirildi.

## Sonraki Oncelikler
- Tek kaynak backlog: `docs/PLAN.md` altindaki `Next` bolumu.
- Labelled seed sayisini en az 10 seviyesinde surekli korumak.
- Seed basina minimum 2 relevant target etiketini korumak.
- Dusuk performansli (`Bottom-3`) seed'lerde score breakdown odakli tuning dongusunu surdurmek.
- Her scoring/penalty degisimi sonrasinda benchmark baseline + regression gate kosmak.
