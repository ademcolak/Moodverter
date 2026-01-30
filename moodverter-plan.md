# Moodverter - Proje Ana Planı

> **Vizyon:** Mood-based müzik navigasyonu yapan cross-platform masaüstü widget
>
> **Hedef:** Demo/Portfolio projesi
>
> **Platform:** macOS + Windows (Tauri)

---

## Proje Özeti

Moodverter, kullanıcının ruh halini anlayıp ona uygun müzik akışı oluşturan bir masaüstü widget'ı. Kullanıcı "bugün enerjik hissediyorum" veya "biraz melankolik" gibi doğal dilde mood girebilir, sistem bunu müzikal parametrelere çevirip uygun şarkıları seçer.

### Temel Özellikler

- **Mood Input:** Doğal dilde mood girişi (Türkçe/İngilizce)
- **Akıllı Şarkı Seçimi:** Energy, valence, tempo gibi parametrelere göre scoring
- **Yumuşak Geçişler:** Şarkılar arası uyumlu geçiş (key, BPM, energy flow)
- **Kullanıcı Adaptasyonu:** Manuel müdahalelere göre mood güncelleme
- **Multi-Platform:** Spotify + YouTube desteği (Faz 2)

---

## Mevcut Durum

| Faz | Durum | Açıklama |
|-----|-------|----------|
| Faz 1: Spotify MVP | ✅ Tamamlandı | Core logic, UI, testler hazır |
| Faz 2: Multi-Platform | 🔄 Başlıyor | YouTube + Ollama + Audio Analysis |

**Not:** Spotify Developer Dashboard geçici olarak kapalı. Faz 2 ile YouTube entegrasyonu ve lokal AI (Ollama) eklenerek bu bağımlılık kaldırılıyor.

---

## Teknoloji Stack

### Frontend
| Teknoloji | Versiyon | Amaç |
|-----------|----------|------|
| Tauri | 2.x | Cross-platform masaüstü framework |
| React | 19.x | UI library |
| TypeScript | 5.x | Type-safe JavaScript |
| Tailwind CSS | 4.x | Styling |

### Backend / AI
| Teknoloji | Amaç |
|-----------|------|
| Ollama | Lokal LLM + Embedding (ücretsiz) |
| essentia.js / meyda | Audio analysis (YouTube için) |

### Müzik Servisleri
| Servis | Durum | Not |
|--------|-------|-----|
| Spotify | ⏸️ Beklemede | Dashboard açılınca aktif |
| YouTube | 🔄 Ekleniyor | API key gerektirmez (IFrame) |

---

## Faz Detayları

### Faz 1: Spotify MVP ✅

Tamamlanan işler:
- Proje iskeleti (Tauri + React + TypeScript)
- Spotify OAuth + Playback kontrolü
- Cache sistemi (localStorage)
- Mood parsing (OpenAI - opsiyonel)
- Navigasyon motoru (scoring, selection, transition)
- Kullanıcı müdahalesi yönetimi
- Widget UI (expand/collapse, drag, system tray)
- Unit testler (126 test)

**Detaylar:** [phase-1-spotify-mvp.md](./docs/phase-1-spotify-mvp.md)

---

### Faz 2: Multi-Platform + Lokal AI 🔄

Hedefler:
- YouTube entegrasyonu (API key gerektirmez)
- Ollama ile ücretsiz mood parsing
- Kendi audio analysis engine'i
- Provider pattern ile platform soyutlama

**Detaylar:** [phase-2-multi-platform.md](./docs/phase-2-multi-platform.md)

---

## Dosya Yapısı

```
moodverter/
├── moodverter-plan.md           # Bu dosya - ana plan
├── docs/
│   ├── phase-1-spotify-mvp.md   # Faz 1 detayları (tamamlandı)
│   └── phase-2-multi-platform.md # Faz 2 detayları (aktif)
├── src/
│   └── ...                       # Uygulama kodu
└── src-tauri/
    └── ...                       # Tauri backend
```

---

## Güncelleme Geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 28-29 Ocak 2026 | Faz 1 tamamlandı |
| 30 Ocak 2026 | Plan yeniden yapılandırıldı, Faz 2 başlatıldı |

---

*Detaylı görev listesi ve checklist'ler için ilgili faz dosyalarına bakın.*
