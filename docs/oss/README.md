# OSS Source Intake

Bu klasor, proje gelistirme sirasinda referans alinan dis kaynaklarin lisans takibini tutar.

## Dosyalar
- `source-registry.json`: Referans/alinti/entegrasyon dusunulen kaynaklarin kaydi.

## Kural
- Yeni bir dis kaynak kullanmadan once `source-registry.json` kaydi eklenir.
- Lisans `licenseSpdx` alaninda net belirtilir.
- `usage` alani (or. `reference`, `code-copy`, `model`, `runtime-dependency`) zorunludur.
- Riskli lisanslarda (`GPL/AGPL/NC`) kayit varsayilan olarak block olur.
- Istisna gerekiyorsa `approvedException: true` ve `notes` ile gerekce yazilir.

## Komut
```bash
pnpm run oss:guard
```

Bu komut registry'yi validate eder ve bloklu lisanslari CI/yerel akista erken yakalar.
