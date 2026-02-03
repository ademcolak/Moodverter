# Faz 3: YouTube + Ollama Geliştirmeleri

> **Hedef:** YouTube otomatik arama, gelişmiş audio analysis, Ollama öneri sistemi
>
> **Önkoşul:** yt-dlp bundle edilecek (sidecar binary)

---

## Özet

Bu fazda 7 ana geliştirme yapılacak:

| # | Özellik | Bağımlılık |
|---|---------|------------|
| 1 | yt-dlp Bundle | - |
| 2 | YouTube Otomatik Arama | #1 |
| 3 | Video Metadata Kullanımı | #2 |
| 4 | Şarkı Metadata Analizi (Ollama) | #3 |
| 5 | Audio Analysis İyileştirme | #1 |
| 6 | Şarkı Öneri Sistemi | #4, #5 |
| 7 | Konuşma Hafızası | #6 |

---

## Bölüm A: yt-dlp Bundle (Sidecar Binary)

### A1. Binary Hazırlığı
- [x] yt-dlp release'lerinden platform binary'lerini indir
  - `yt-dlp-aarch64-apple-darwin` (macOS ARM64) ✓
  - `yt-dlp_macos` (x64) - gerektiğinde eklenecek
  - `yt-dlp.exe` (Windows x64) - gerektiğinde eklenecek
- [x] `src-tauri/binaries/` klasörüne yerleştir
- [x] Tauri naming convention: `yt-dlp-{target_triple}`

### A2. Tauri Konfigürasyonu
- [x] `tauri.conf.json` → `bundle.externalBin` ekle
- [x] `capabilities` → shell execute permission

```json
{
  "bundle": {
    "externalBin": ["binaries/yt-dlp"]
  }
}
```

### A3. Rust Wrapper
- [x] `src-tauri/src/ytdlp.rs` oluştur
- [x] `search_youtube(query, limit)` → JSON sonuç
- [x] `get_video_info(video_id)` → metadata
- [x] `get_audio_url(video_id)` → stream URL

```rust
#[tauri::command]
async fn search_youtube(query: String, limit: u32) -> Result<Vec<VideoInfo>, String>
```

### A4. Frontend Binding
- [x] `src/services/youtube/ytdlp.ts` oluştur
- [x] Tauri invoke wrapper
- [x] Error handling (binary not found, network error)

**Dosyalar:**
- `src-tauri/binaries/yt-dlp-*`
- `src-tauri/src/ytdlp.rs`
- `src-tauri/src/lib.rs` (command registration)
- `src-tauri/tauri.conf.json`
- `src/services/youtube/ytdlp.ts`

---

## Bölüm B: YouTube Otomatik Arama

### B1. Search Service
- [x] `src/services/youtube/search.ts` oluştur
- [x] `searchVideos(query, limit?)` → UnifiedTrack[]
- [x] Sonuçları UnifiedTrack formatına dönüştür
- [x] Thumbnail URL extraction

### B2. UI - Arama Alanı
- [x] Library view'a search input ekle
- [x] Debounced search (300ms)
- [x] Loading state
- [x] Sonuç listesi (tıkla → kütüphaneye ekle)

### B3. Smart Search
- [x] Mood'a göre arama query oluşturma
- [x] "enerjik" → "energetic music workout"
- [x] Genre tagging: "rock", "electronic", "jazz"

**Dosyalar:**
- `src/services/youtube/search.ts`
- `src/components/LibrarySearch.tsx` (yeni)
- `src/components/Settings.tsx` (Source tab güncelle)

---

## Bölüm C: Video Metadata Kullanımı

### C1. Metadata Extraction
- [x] yt-dlp'den zengin metadata çek:
  - title, uploader, description
  - tags, categories
  - duration, view_count
  - upload_date

### C2. Metadata Parser
- [x] `src/services/youtube/metadata.ts` oluştur
- [x] Title'dan artist - song ayrıştırma
- [x] Description'dan genre/mood ipuçları
- [x] Tags'den ek bilgi

```typescript
interface VideoMetadata {
  videoId: string;
  title: string;
  artist: string;      // parsed from title
  songName: string;    // parsed from title
  genres: string[];    // from tags/description
  moods: string[];     // detected keywords
  duration: number;
  thumbnail: string;
}
```

### C3. Cache
- [x] Metadata cache (localStorage)
- [x] Video ID → metadata mapping

**Dosyalar:**
- `src/services/youtube/metadata.ts`
- `src/types/youtube.ts` (VideoMetadata interface)

---

## Bölüm D: Şarkı Metadata Analizi (Ollama)

### D1. Preset Embedding'leri Generate Et
- [x] `scripts/generate-embeddings.ts` oluştur
- [x] Mevcut preset phrase'leri Ollama'ya gönder
- [x] Her phrase için 768-dim embedding al
- [x] `mood-presets.json`'u güncelle

```bash
pnpm run generate:embeddings
```

### D2. Title/Artist Mood Analizi
- [x] `src/services/mood/metadataAnalyzer.ts` oluştur
- [x] Şarkı title + artist → Ollama embed
- [x] Preset'lerle similarity hesapla
- [x] En yakın mood category döndür

```typescript
async function analyzeSongMetadata(title: string, artist: string): Promise<{
  suggestedMood: string;
  confidence: number;
  audioParams: AudioFeatures;
}>
```

### D3. Engine Entegrasyonu
- [x] `mood/engine.ts` güncelle
- [x] Yeni şarkı eklenince otomatik analiz
- [x] Sonuçları track cache'ine kaydet

**Dosyalar:**
- `scripts/generate-embeddings.ts`
- `src/data/mood-presets.json` (embeddings dolu)
- `src/services/mood/metadataAnalyzer.ts`
- `src/services/mood/engine.ts`

---

## Bölüm E: Audio Analysis İyileştirme

### E1. yt-dlp Audio Stream
- [x] `get_audio_url(video_id)` → direct audio URL
- [x] CORS bypass (Tauri üzerinden fetch)
- [x] Audio buffer'ı frontend'e aktar

### E2. Meyda Entegrasyonu
- [x] `pnpm add meyda`
- [x] `src/services/audio/meydaAnalyzer.ts` oluştur
- [x] Daha doğru feature extraction:
  - Real BPM (onset detection)
  - Spectral features
  - Chroma (key detection)

### E3. Hybrid Analysis
- [x] Mevcut analyzer + Meyda birleştir
- [x] Confidence-based feature selection
- [x] Fallback: title-based synthetic

```typescript
interface EnhancedAnalysis {
  // Meyda features
  tempo: number;           // ±5 BPM accuracy
  key: number;             // Chroma-based
  mode: number;            // Major/minor

  // Existing features
  energy: number;
  valence: number;
  danceability: number;

  // Meta
  analysisMethod: 'meyda' | 'webaudio' | 'synthetic';
  confidence: number;
}
```

**Dosyalar:**
- `src/services/audio/meydaAnalyzer.ts`
- `src/services/audio/analyzer.ts` (refactor)
- `package.json` (meyda dependency)

---

## Bölüm F: Şarkı Öneri Sistemi

### F1. Track Embedding
- [x] Her track için embedding oluştur
- [x] Input: title + artist + detected mood + audio features
- [x] Ollama nomic-embed-text ile

### F2. Similarity Search
- [x] `src/services/recommendation/engine.ts` oluştur
- [x] Mevcut şarkıya benzer şarkıları bul
- [x] Cosine similarity threshold: 0.7

```typescript
async function getRecommendations(
  currentTrack: UnifiedTrack,
  library: UnifiedTrack[],
  limit: number
): Promise<UnifiedTrack[]>
```

### F3. Mood-Based Recommendations
- [x] Mevcut mood'a uygun şarkıları öner
- [x] Audio features + embedding hybrid scoring
- [x] Navigator/selector entegrasyonu

### F4. UI - Öneriler Paneli
- [x] "Benzer şarkılar" section
- [x] Now Playing altında 3-5 öneri
- [x] Tıkla → sıraya ekle

**Dosyalar:**
- `src/services/recommendation/engine.ts`
- `src/services/recommendation/embeddings.ts`
- `src/components/Recommendations.tsx`

---

## Bölüm G: Konuşma Hafızası

### G1. User Preference Store
- [x] `src/services/memory/preferences.ts` oluştur
- [x] Skip edilen şarkıları kaydet (negative signal)
- [x] Tam dinlenen şarkıları kaydet (positive signal)
- [x] Genre/mood tercih ağırlıkları

### G2. Context Window
- [x] Son 10 mood input'u tut
- [x] Pattern recognition: "genelde akşam chill istiyor"
- [x] Time-based preferences

### G3. Adaptive Scoring
- [x] Navigator scorer'ı güncelle
- [x] User preference weight: +0.1 bonus
- [x] Skip penalty: -0.2

```typescript
interface UserPreferences {
  likedGenres: Map<string, number>;      // genre → weight
  dislikedArtists: Set<string>;
  preferredTempo: { min: number; max: number };
  timeBasedMoods: Map<string, string>;   // "evening" → "chill"
  skipHistory: string[];                  // track IDs
}
```

**Dosyalar:**
- `src/services/memory/preferences.ts`
- `src/services/memory/context.ts`
- `src/services/navigator/scorer.ts` (güncelle)

---

## Uygulama Sırası

```
Hafta 1: Temel Altyapı
├── A1-A4: yt-dlp bundle
└── B1-B2: Arama servisi

Hafta 2: Metadata
├── C1-C3: Video metadata
├── D1: Preset embeddings generate
└── D2-D3: Metadata analizi

Hafta 3: Audio
├── E1: Audio stream
├── E2-E3: Meyda entegrasyonu
└── B3: Smart search

Hafta 4: Öneri Sistemi
├── F1-F3: Recommendation engine
├── F4: UI
└── G1-G3: Kullanıcı hafızası
```

---

## Test Planı

### Unit Tests
- [ ] yt-dlp wrapper (mock subprocess)
- [ ] Metadata parser
- [ ] Embedding similarity
- [ ] Audio analyzer (Meyda)

### Integration Tests
- [ ] Search → Add → Analyze → Play flow
- [ ] Recommendation accuracy
- [ ] Fallback zincirleri

### Manual Tests
- [ ] macOS + Windows binary çalışıyor
- [ ] 10 farklı şarkı ara ve analiz et
- [ ] Öneri kalitesini değerlendir

---

## Kritik Dosyalar

| Dosya | Değişiklik Türü |
|-------|-----------------|
| `src-tauri/src/lib.rs` | yt-dlp commands |
| `src-tauri/tauri.conf.json` | externalBin, permissions |
| `src/services/youtube/search.ts` | YENİ |
| `src/services/youtube/metadata.ts` | YENİ |
| `src/services/mood/metadataAnalyzer.ts` | YENİ |
| `src/services/audio/meydaAnalyzer.ts` | YENİ |
| `src/services/recommendation/engine.ts` | YENİ |
| `src/services/memory/preferences.ts` | YENİ |
| `src/data/mood-presets.json` | embeddings ekle |

---

## Notlar

- yt-dlp binary ~20MB, her platform için ayrı
- Ollama zorunlu değil, keyword fallback var
- Meyda browser-based, dependency küçük (~50KB)
- Her şarkı analizi ~2-5 saniye (ilk seferde)
