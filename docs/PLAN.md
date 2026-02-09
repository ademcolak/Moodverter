# Moodverter Genel Plan (YouTube Core)

> Son güncelleme: 9 Şubat 2026
> Kapsam: YouTube'dan şarkı bulma, ekleme ve çalma

## Özet
Moodverter şu an bilinçli olarak dar kapsamda tutuluyor. Önce stabil bir temel akış kuruluyor:
- YouTube linki ekle
- YouTube arama sonucu ekle/çal
- Yerel kütüphane yönetimi
- Temel oynatma kontrolleri

## Now
### 1) Core UX stabilizasyonu
- Arama kutusu, URL ekleme ve kütüphane alanının akışını netleştir
- Hata mesajlarını sadeleştir ve kullanıcıya net göster
- Oynatma kontrollerinde (play/pause/next/previous/seek) tutarlılığı artır

Kabul kriterleri:
- Uygulama açılır açılmaz YouTube akışı hazır olur
- Kullanıcı link ekleyip hemen çalabilir
- Arama sonucu tek tıkla çalar ve isteğe bağlı kütüphaneye eklenir

### 2) Teknik sadeleşme
- Kullanılmayan dosya, bağımlılık ve eski mimari katmanlarını temiz tut
- Dokümantasyonu mevcut kapsamla hizalı tut

Kabul kriterleri:
- `pnpm -s lint`, `pnpm -s tsc --noEmit`, `pnpm -s build` geçer
- Kod tabanında sadece aktif YouTube akışıyla ilgili modüller kalır

## Next
### 1) Minimal kalite kapısı
- YouTube core akışı için birkaç kritik smoke test ekle
- Hata senaryoları için (geçersiz link, sonuç yok, yt-dlp yok) doğrulama listesi oluştur

### 2) UI polish
- Liste/oynatıcı spacing ve okunabilirlik iyileştirmeleri
- Daha net loading durumları

## Later
### 1) Faz bazlı genişleme
- Stabil temel tamamlandıktan sonra yeni fazlar açılacak
- Her faz için net kapsam + kabul kriteri şart olacak

## Backlog Item Şablonu
```md
### [ID] Başlık
- Amaç:
- Kapsam:
- Kapsam dışı:
- Kabul kriterleri:
- Doğrulama:
```
