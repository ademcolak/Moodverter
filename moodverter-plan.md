# Moodverter - Proje Geliştirme Planı

> **Proje Özeti:** Spotify entegrasyonlu, mood-based müzik navigasyonu yapan cross-platform masaüstü widget.
> 
> **Hedef:** Demo/Portfolio projesi
> 
> **Platform:** macOS + Windows (Tauri ile cross-platform)

---

## 📋 Teknoloji Stack

### Frontend (Widget UI)
| Teknoloji | Versiyon | Amaç |
|-----------|----------|------|
| Tauri | 2.9.x | Cross-platform masaüstü uygulama framework'ü |
| React | 19.x | UI component library |
| TypeScript | 5.8.x | Type-safe JavaScript |
| Tailwind CSS | 4.x | Utility-first CSS framework |
| Vite | 7.x | Build tool ve dev server |

### Backend/Core Logic (Lokal)
| Teknoloji | Versiyon | Amaç |
|-----------|----------|------|
| Rust | 1.93.x | Tauri backend (minimal kullanım) |
| localStorage | - | Geçici cache (SQLite sonra) |
| pnpm | 10.x | Paket yöneticisi |

### Harici Servisler
| Servis | Amaç |
|--------|------|
| Spotify Web API | Auth, playback kontrolü, audio features |
| OpenAI API | Mood → müzikal parametreler dönüşümü (NLP) |

### Geliştirme Araçları
| Araç | Amaç |
|------|------|
| pnpm | Paket yöneticisi |
| ESLint + Prettier | Kod kalitesi |
| Git | Versiyon kontrolü |

---

## 🏗️ Proje Yapısı

```
moodverter/
├── src/                          # Frontend React kodu
│   ├── components/               # UI bileşenleri
│   │   ├── MoodInput.tsx        # Mood giriş alanı
│   │   ├── NowPlaying.tsx       # Şu an çalan şarkı
│   │   ├── NextTrack.tsx        # Sonraki şarkı preview
│   │   ├── PlayerControls.tsx   # Playback kontrolleri
│   │   └── Settings.tsx         # Ayarlar paneli
│   ├── hooks/                    # Custom React hooks
│   │   ├── useSpotify.ts        # Spotify API hook
│   │   ├── usePlayback.ts       # Playback state hook
│   │   └── useMood.ts           # Mood state hook
│   ├── services/                 # İş mantığı
│   │   ├── spotify/             # Spotify entegrasyonu
│   │   │   ├── auth.ts          # OAuth flow
│   │   │   ├── api.ts           # API çağrıları
│   │   │   ├── playback.ts      # Playback kontrolü
│   │   │   └── analysis.ts      # Audio analysis
│   │   ├── navigator/           # Şarkı seçim motoru
│   │   │   ├── scorer.ts        # Geçiş puanlama
│   │   │   ├── selector.ts      # Şarkı seçici
│   │   │   └── transition.ts    # Geçiş hesaplama
│   │   ├── mood/                # Mood işleme
│   │   │   ├── parser.ts        # NLP ile mood analizi
│   │   │   └── mapper.ts        # Mood → audio params
│   │   └── db/                  # Veritabanı
│   │       ├── schema.ts        # DB şeması
│   │       ├── cache.ts         # Şarkı cache
│   │       └── history.ts       # Çalma geçmişi
│   ├── types/                    # TypeScript tipleri
│   │   ├── spotify.ts           # Spotify API tipleri
│   │   ├── mood.ts              # Mood tipleri
│   │   └── track.ts             # Şarkı tipleri
│   ├── utils/                    # Yardımcı fonksiyonlar
│   ├── App.tsx                   # Ana uygulama
│   ├── main.tsx                  # React entry point
│   └── styles/                   # Global stiller
├── src-tauri/                    # Tauri Rust backend
│   ├── src/
│   │   └── main.rs              # Tauri entry point
│   ├── Cargo.toml               # Rust bağımlılıkları
│   └── tauri.conf.json          # Tauri konfigürasyonu
├── public/                       # Statik dosyalar
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── README.md
```

---

## 📅 Geliştirme Fazları

### Faz 0: Ortam Kurulumu ✅
**Süre:** 1-2 gün

- [x] **0.1** Node.js (v20 LTS) kurulumu
- [x] **0.2** Rust kurulumu (rustup ile)
- [x] **0.3** pnpm kurulumu (`npm install -g pnpm`)
- [x] **0.4** Tauri CLI kurulumu (`cargo install tauri-cli`)
- [x] **0.5** VS Code eklentileri (Tauri, Rust Analyzer, ESLint, Prettier, Tailwind)
- [x] **0.6** Git repo oluşturma
- [ ] **0.7** Spotify Developer hesabı oluşturma ⏳ *Kullanıcı yapacak*
- [ ] **0.8** Spotify App oluşturma (Client ID ve Secret alma) ⏳ *Kullanıcı yapacak*
- [ ] **0.9** OpenAI API key alma ⏳ *Opsiyonel, kullanıcı yapacak*

---

### Faz 1: Proje İskeleti ✅
**Süre:** 2-3 gün

- [x] **1.1** Tauri + React + TypeScript projesi oluşturma
  ```bash
  pnpm create tauri-app moodverter --template react-ts
  ```
- [x] **1.2** Tailwind CSS entegrasyonu
- [x] **1.3** Proje klasör yapısını oluşturma (yukarıdaki yapı)
- [x] **1.4** ESLint + Prettier konfigürasyonu
- [x] **1.5** Temel TypeScript tiplerini tanımlama
- [x] **1.6** Environment variables yapısı (.env dosyası)
- [x] **1.7** Tauri window konfigürasyonu (always-on-top, boyut, frameless)
- [x] **1.8** İlk build testi (macOS ve/veya Windows)

---

### Faz 2: Spotify Entegrasyonu ✅
**Süre:** 4-5 gün

#### 2A: Authentication
- [x] **2.1** Spotify OAuth 2.0 PKCE flow implementasyonu
- [x] **2.2** Token storage (secure storage with Tauri) *localStorage ile, Tauri secure storage sonra*
- [x] **2.3** Token refresh mekanizması
- [x] **2.4** Login/Logout UI
- [x] **2.5** Auth state management

#### 2B: Playback Kontrolü
- [x] **2.6** Spotify Web Playback SDK entegrasyonu *Polling ile*
- [x] **2.7** Şu an çalan şarkıyı alma (polling veya SDK event)
- [x] **2.8** Play/Pause/Skip kontrolleri
- [x] **2.9** Seek (belirli saniyeye gitme) fonksiyonu
- [x] **2.10** Playback state listener (kullanıcı müdahalesini yakalama)

#### 2C: API Fonksiyonları
- [x] **2.11** Kullanıcı library'sini çekme (liked songs)
- [x] **2.12** Kullanıcı playlistlerini çekme
- [x] **2.13** Audio features çekme (tek şarkı)
- [x] **2.14** Audio features batch çekme (100 şarkı)
- [x] **2.15** Audio analysis çekme (sections, segments)
- [x] **2.16** Recommendations API entegrasyonu
- [x] **2.17** Rate limiting ve error handling

---

### Faz 3: Veritabanı ve Cache ✅
**Süre:** 2-3 gün

- [ ] **3.1** SQLite veritabanı kurulumu (Tauri ile) *localStorage ile geçici çözüm mevcut - opsiyonel*
- [x] **3.2** Şarkı tablosu şeması oluşturma
  ```sql
  CREATE TABLE tracks (
    spotify_id TEXT PRIMARY KEY,
    name TEXT,
    artist TEXT,
    duration_ms INTEGER,
    release_year INTEGER,
    energy REAL,
    valence REAL,
    tempo REAL,
    danceability REAL,
    acousticness REAL,
    instrumentalness REAL,
    key INTEGER,
    mode INTEGER,
    intro_end_ms INTEGER,
    outro_start_ms INTEGER,
    last_played DATETIME,
    play_count INTEGER DEFAULT 0,
    cached_at DATETIME
  );
  ```
- [x] **3.3** Çalma geçmişi tablosu
- [x] **3.4** Cache CRUD operasyonları
- [x] **3.5** İlk login'de library sync (loading ekranı ile)
- [x] **3.6** Incremental sync (sadece yeni şarkılar) *24 saat cache freshness*
- [x] **3.7** Cache invalidation stratejisi

---

### Faz 4: Mood İşleme (NLP) ✅
**Süre:** 3-4 gün

- [x] **4.1** OpenAI API entegrasyonu
- [x] **4.2** Mood prompt şablonu oluşturma
  ```
  Kullanıcı mood'u: "{user_input}"
  
  Bu mood'u şu müzikal parametrelere dönüştür:
  - energy (0.0-1.0): Enerji seviyesi
  - valence (0.0-1.0): Pozitiflik/Negatiflik
  - tempo_min, tempo_max: BPM aralığı
  - danceability (0.0-1.0): Dans edilebilirlik
  - acousticness (0.0-1.0): Akustiklik tercihi
  
  JSON formatında cevap ver.
  ```
- [x] **4.3** Mood response parser
- [x] **4.4** Mood parametrelerini normalize etme
- [x] **4.5** Mood geçmişi tutma (konuşma context'i)
- [x] **4.6** Error handling (API hatası, geçersiz response)
- [x] **4.7** Fallback mekanizması (API çalışmazsa basit keyword mapping)

---

### Faz 5: Navigasyon Motoru (Şarkı Seçimi) ✅
**Süre:** 5-7 gün

#### 5A: Puanlama Sistemi
- [x] **5.1** Şarkı-mood uyum skoru hesaplama
  ```typescript
  // Örnek formül
  score = (
    w1 * (1 - |track.energy - target.energy|) +
    w2 * (1 - |track.valence - target.valence|) +
    w3 * tempoScore(track.tempo, target.tempo_range) +
    w4 * (1 - |track.danceability - target.danceability|)
  )
  ```
- [x] **5.2** Şarkılar arası geçiş skoru hesaplama
  ```typescript
  // Camelot wheel uyumu, BPM yakınlığı, energy akışı
  transitionScore = (
    keyCompatibility(prev, next) +
    bpmProximity(prev, next) +
    energyFlow(prev, next)
  )
  ```
- [x] **5.3** Ağırlık parametreleri fine-tuning
- [x] **5.4** Çeşitlilik faktörü (aynı artist'i üst üste çalmama)

#### 5B: Seçim Algoritması
- [x] **5.5** Kandidat havuzu oluşturma (library + recommendations)
- [x] **5.6** Tekrar engelleme filtresi
- [x] **5.7** "Yeni şarkılara açığım" toggle implementasyonu
- [x] **5.8** Top-N skorlama ve weighted random seçim
- [x] **5.9** Edge case'ler (havuz çok küçükse, uygun şarkı yoksa)

#### 5C: Geçiş Hesaplama
- [x] **5.10** Audio analysis'den intro/outro tespiti
- [x] **5.11** Optimal geçiş noktası hesaplama
- [x] **5.12** Seek komutları scheduling

---

### Faz 6: Kullanıcı Müdahalesi Yönetimi ✅
**Süre:** 2-3 gün

- [x] **6.1** Playback state değişikliği dinleme
- [x] **6.2** Skip tespiti ve handling
- [x] **6.3** Manuel şarkı değişikliği tespiti
- [x] **6.4** Yeni şarkının feature'larını çekme
- [x] **6.5** Mood sapma hesaplama *calculateDeviation fonksiyonu*
- [x] **6.6** Küçük sapma → sessiz adaptasyon
- [x] **6.7** Büyük sapma → kullanıcıya soru UI
- [x] **6.8** Mood güncelleme akışı

---

### Faz 7: Widget UI ✅
**Süre:** 4-5 gün

#### 7A: Temel Arayüz
- [ ] **7.1** Minimal widget tasarımı (Figma veya sketch) *Opsiyonel*
- [x] **7.2** Ana layout implementasyonu
- [x] **7.3** "Şu an çalan" komponenti
- [x] **7.4** "Sonraki şarkı" preview komponenti
- [x] **7.5** Progress bar (geçiş noktası göstergeli)
- [x] **7.6** Mood input alanı
- [x] **7.7** Temel playback kontrolleri

#### 7B: Etkileşim
- [x] **7.8** Drag ile pencere taşıma
- [x] **7.9** Expand/collapse animasyonu
- [x] **7.10** Hover states ve tooltips
- [x] **7.11** Loading states
- [x] **7.12** Error states ve mesajları

#### 7C: Ayarlar
- [x] **7.13** Settings panel
- [x] **7.14** "Yeni şarkılara açığım" toggle
- [x] **7.15** API key girişi (OpenAI)
- [x] **7.16** Spotify bağlantı durumu
- [x] **7.17** Cache temizleme butonu

---

### Faz 8: Test ve Polish
**Süre:** 3-4 gün

- [x] **8.1** Unit testler (kritik fonksiyonlar için) ✅ *126 test (cache, selector, scorer, mapper, transition)*
- [ ] **8.2** End-to-end akış testi ⏳ *Spotify bağlantısı gerektirir*
- [ ] **8.3** macOS build ve test ⏳ *Spotify bağlantısı gerektirir*
- [ ] **8.4** Windows build ve test ⏳ *Spotify bağlantısı gerektirir*
- [x] **8.5** Edge case testleri ✅ *Testlerde kapsamlı edge case coverage*
- [x] **8.6** Performance optimizasyonu ✅ *Cache quota handling eklendi*
- [x] **8.7** Memory leak kontrolü ✅ *useSpotify hook düzeltildi (isMountedRef)*
- [x] **8.8** Error handling review ✅ *cache.ts localStorage quota exceeded handling*
- [ ] **8.9** UI/UX iyileştirmeleri ⏳ *Spotify bağlantısı ile test gerektirir*

---

### Faz 9: Dağıtım ve Dokümantasyon
**Süre:** 2-3 gün

- [ ] **9.1** README.md yazımı (kurulum, kullanım)
- [ ] **9.2** Kod dökümentasyonu
- [ ] **9.3** macOS .dmg oluşturma
- [ ] **9.4** Windows .msi/.exe oluşturma
- [ ] **9.5** GitHub releases
- [ ] **9.6** Demo video/GIF hazırlama
- [ ] **9.7** Portfolio sayfası için açıklama

---

## ⏱️ Toplam Tahmini Süre

| Faz | Süre |
|-----|------|
| Faz 0: Ortam Kurulumu | 1-2 gün |
| Faz 1: Proje İskeleti | 2-3 gün |
| Faz 2: Spotify Entegrasyonu | 4-5 gün |
| Faz 3: Veritabanı ve Cache | 2-3 gün |
| Faz 4: Mood İşleme (NLP) | 3-4 gün |
| Faz 5: Navigasyon Motoru | 5-7 gün |
| Faz 6: Kullanıcı Müdahalesi | 2-3 gün |
| Faz 7: Widget UI | 4-5 gün |
| Faz 8: Test ve Polish | 3-4 gün |
| Faz 9: Dağıtım | 2-3 gün |
| **TOPLAM** | **28-39 gün** |

> **Not:** Bu süreler tam zamanlı çalışma varsayımıyla. Part-time çalışırsan 2-3x ile çarp.

---

## 🔑 Kritik Kararlar ve Notlar

### Spotify API Limitleri
- Rate limit: ~180 istek/dakika (kullanıcı başına)
- Audio features batch: max 100 şarkı/istek
- Recommendations: max 100 şarkı/istek

### OpenAI API Maliyeti
- GPT-3.5-turbo: ~$0.002 / 1K token
- Mood başına ~500 token = ~$0.001
- Günde 100 mood = ~$0.10

### Bilinen Kısıtlamalar
- Spotify Premium zorunlu (playback kontrolü için)
- İnternet bağlantısı zorunlu
- Spotify desktop veya web player açık olmalı

### Gelecek Özellikler (MVP Sonrası)
- Preset mood'lar
- Zaman bazlı mood journey
- Kullanıcı tercih öğrenme
- Çoklu platform desteği (YouTube?)
- Sosyal özellikler (mood paylaşma)

---

## 📝 Güncelleme Geçmişi

| Tarih | Değişiklik |
|-------|------------|
| - | İlk versiyon oluşturuldu |
| 28 Ocak 2026 | Faz 0, 1, 2, 4, 5 tamamlandı. Faz 3, 6, 7 kısmen tamamlandı. |
| 28 Ocak 2026 | Faz 3, 6, 7 tamamlandı. Kullanıcı müdahalesi yönetimi, expand/collapse, hover states, library sync eklendi. |
| 29 Ocak 2026 | Faz 8 kısmen tamamlandı: Unit testler (126 test), memory leak fix, error handling iyileştirmeleri. Spotify bağlantısı bekleyen testler hariç. |
| 29 Ocak 2026 | Lint hataları düzeltildi. README güncellendi. System Tray entegrasyonu eklendi. Preset mood butonları eklendi. |

---

## 🎯 Mevcut Durum

**Tamamlanan:** Faz 0 ✅, Faz 1 ✅, Faz 2 ✅, Faz 3 ✅, Faz 4 ✅, Faz 5 ✅, Faz 6 ✅, Faz 7 ✅, Faz 8 (kısmen) ✅
**Bekleyen:** Faz 8 (Spotify gerektiren testler), Faz 9

**Tamamlanan İyileştirmeler (29 Ocak 2026):**
- ✅ Unit testler: 126 test (cache.test.ts, selector.test.ts eklendi)
- ✅ Memory leak fix: useSpotify hook'ta isMountedRef ile async cleanup
- ✅ Error handling: cache.ts'de localStorage quota exceeded handling
- ✅ Edge case testleri: Kapsamlı test coverage

**Sonraki Adımlar (Spotify bağlantısı sonrası):**
1. `.env` dosyası oluştur ve `VITE_SPOTIFY_CLIENT_ID` ekle
2. Spotify Developer Dashboard'dan app oluştur
3. `pnpm tauri dev` ile test et
4. End-to-end akış testi (8.2)
5. macOS/Windows build ve test (8.3, 8.4)
6. UI/UX iyileştirmeleri (8.9)
7. Faz 9: Dağıtım ve Dokümantasyon

---

## 📝 Backlog (MVP Sonrası)

### Yüksek Öncelik
- [x] **System Tray Entegrasyonu** - macOS menu bar / Windows system tray ikonu ✅
  - ✅ Pencereyi gizle/göster toggle
  - ✅ Tray ikonuna tıklayınca widget açılır/kapanır
  - ✅ Sağ tık menüsü (Show, Hide, Quit)
- [x] **Pencere Minimize/Gizleme** - Kapatma yerine gizleme butonu ✅
  - ✅ X butonu pencereyi kapatmasın, tray'e göndersin
  - [ ] Keyboard shortcut ile toggle (ör: Cmd+Shift+M) *Gelecek*
- [ ] **Always-on-top Toggle** - Her zaman üstte kalma seçeneği
  - Settings'te toggle ekle
  - Kullanıcı isterse alta indirebilsin
  - Varsayılan: açık (widget davranışı)

### Orta Öncelik
- [ ] **Ritme göre geçiş (Transition)** - Mevcut transition.ts kodunu entegre et
- [ ] **Gerçek Spotify verisi ile mock** - Kullanıcının kendi şarkılarını export edip mock olarak kullan

### Düşük Öncelik
- [x] **Preset mood'lar** - Hazır mood butonları (Energetic, Chill, Focus, vb.) ✅
- [ ] **Mini player modu** - Daha da küçük görünüm seçeneği

---

*Bu döküman proje ilerledikçe güncellenecektir. Her tamamlanan adımı ✅ ile işaretle.*
