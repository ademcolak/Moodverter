# Faz 2: Multi-Platform + Lokal AI

> **Durum:** Tamamlandı ✅
>
> **Hedef:** YouTube entegrasyonu, Ollama ile ücretsiz AI, kendi audio analysis

---

## Neden Bu Faz?

Spotify Developer Dashboard geçici olarak kapalı. Ancak bu bir fırsat:

1. **Bağımsızlık:** Tek platforma bağımlı olmaktan kurtuluyoruz
2. **Maliyet:** OpenAI yerine Ollama = 0 maliyet
3. **Teknik Derinlik:** Kendi audio analysis = portfolio'da fark yaratan özellik
4. **Offline:** Lokal AI ile internet olmadan bile mood parsing çalışır

---

## Genel Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                         MOODVERTER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Mood       │    │  Navigator  │    │  Player     │         │
│  │  Engine     │    │  Engine     │    │  UI         │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                 │
│         ▼                  ▼                  ▼                 │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              Unified Track Interface                │       │
│  │   { id, name, artist, audioFeatures, provider }     │       │
│  └─────────────────────────┬───────────────────────────┘       │
│                            │                                    │
│         ┌──────────────────┼──────────────────┐                │
│         ▼                  ▼                  ▼                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │  Spotify    │    │  YouTube    │    │   Mock      │        │
│  │  Provider   │    │  Provider   │    │  Provider   │        │
│  └──────┬──────┘    └──────┬──────┘    └─────────────┘        │
│         │                  │                                   │
│         ▼                  ▼                                   │
│    Spotify API       ┌─────────────┐                          │
│    (hazır data)      │   Audio     │                          │
│                      │  Analyzer   │                          │
│                      └─────────────┘                          │
│                      (sentetik data)                          │
│                                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐       │
│  │                    OLLAMA                            │       │
│  │  ┌─────────────┐         ┌─────────────┐            │       │
│  │  │ LLM         │         │ Embeddings  │            │       │
│  │  │ llama3.2:3b │         │ nomic-embed │            │       │
│  │  └─────────────┘         └─────────────┘            │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Mood Engine Akışı

```
Kullanıcı Input: "bugün biraz melankolik ama dans edebilirim"
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │  1. Preset Check              │
                    │  Exact match var mı?          │
                    │  "energetic", "sad", etc.     │
                    └───────────────┬───────────────┘
                                    │
                         Hayır      │      Evet
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌───────────────────────┐       Direkt params döndür
        │  2. Embedding Match   │       (0ms, cache'den)
        │  Ollama nomic-embed   │
        │  Cosine similarity    │
        └───────────┬───────────┘
                    │
              Güven > 0.75?
                    │
         Evet      │       Hayır
        ┌──────────┴──────────┐
        ▼                     ▼
  En yakın preset      ┌─────────────────┐
  params döndür        │  3. LLM Parse   │
  (~50ms)              │  Ollama llama3  │
                       │  Detaylı analiz │
                       └─────────────────┘
                              │
                              ▼
                       Params döndür
                       (~2 saniye)
```

---

## Checklist

### Bölüm A: Temel Altyapı

#### A1. Provider Interface Oluşturma
- [x] `MusicProvider` interface tanımla
- [x] `UnifiedTrack` type oluştur (platform-agnostic)
- [x] `AudioFeatures` type standardize et
- [x] Provider factory fonksiyonu yaz

```typescript
// src/types/provider.ts
interface MusicProvider {
  name: 'spotify' | 'youtube' | 'mock';

  // Auth
  isAuthenticated(): boolean;
  authenticate(): Promise<void>;
  logout(): void;

  // Library
  getLibrary(): Promise<UnifiedTrack[]>;
  search(query: string): Promise<UnifiedTrack[]>;

  // Playback
  play(trackId: string): Promise<void>;
  pause(): Promise<void>;
  skip(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  getCurrentTrack(): Promise<UnifiedTrack | null>;

  // Features
  getAudioFeatures(trackId: string): Promise<AudioFeatures>;
}
```

#### A2. Mevcut Spotify Kodunu Refactor
- [x] `SpotifyProvider` class oluştur
- [x] Mevcut `spotify/` kodlarını provider'a taşı
- [x] `useSpotify` hook'u provider-agnostic yap
- [x] Test et (mevcut testler geçmeli)

#### A3. Mock Provider (Geliştirme İçin)
- [x] `MockProvider` class oluştur
- [x] 50-100 fake şarkı datası
- [x] Simüle edilmiş playback state
- [x] UI geliştirme için kullanılacak

---

### Bölüm B: Ollama Entegrasyonu

#### B1. Ollama Service
- [x] `src/services/ai/ollama.ts` oluştur
- [x] Connection check fonksiyonu
- [x] Generate (LLM) wrapper
- [x] Embeddings wrapper
- [x] Error handling (Ollama kapalıysa graceful fallback)

```typescript
// src/services/ai/ollama.ts
const OLLAMA_URL = 'http://localhost:11434';

export async function isOllamaRunning(): Promise<boolean>;
export async function generate(prompt: string, model?: string): Promise<string>;
export async function embed(text: string): Promise<number[]>;
```

#### B2. Mood Preset Generator (Build Time Script)
- [x] `scripts/generate-presets.ts` oluştur
- [x] Ollama'dan 50 mood kategorisi üret
- [x] Her kategoriye 5 varyasyon cümle
- [x] Her kategoriye audio params ata
- [x] Tüm cümleleri embed et
- [x] `src/data/mood-presets.json` olarak kaydet

```typescript
// Üretilecek format
{
  "presets": [
    {
      "category": "energetic",
      "phrases": ["pumped up", "enerjik", "fired up", "coşkulu", "hyped"],
      "params": {
        "energy": 0.85,
        "valence": 0.75,
        "danceability": 0.80,
        "tempo": { "min": 120, "max": 150 }
      },
      "embeddings": [[0.23, -0.45, ...], [...], ...] // Her phrase için
    },
    // ... 49 tane daha
  ]
}
```

#### B3. Embedding-Based Mood Matcher
- [x] `src/services/mood/embedMatcher.ts` oluştur
- [x] Cosine similarity fonksiyonu
- [x] Preset yükleyici
- [x] Match fonksiyonu (input → en yakın preset)
- [x] Confidence threshold (0.75)
- [x] Unit testler

#### B4. Yeni Mood Parser (Ollama LLM)
- [x] `src/services/mood/ollamaParser.ts` oluştur
- [x] Prompt template (Türkçe/İngilizce)
- [x] JSON response parser
- [x] Fallback zinciri: Preset → Embedding → LLM → Keyword

#### B5. Mood Engine Entegrasyonu
- [x] `src/services/mood/engine.ts` oluştur
- [x] Üç katmanlı fallback sistemi
- [x] Caching (aynı input = aynı output)
- [x] Mevcut `useMood` hook'u güncelle

---

### Bölüm C: YouTube Entegrasyonu

#### C1. YouTube IFrame Player
- [x] `src/services/youtube/player.ts` oluştur
- [x] IFrame API yükleyici
- [x] Player instance yönetimi
- [x] Event listeners (state change, error)
- [x] Play/pause/seek kontrolü

#### C2. YouTube Search (API Key'siz)
- [x] Arama stratejisi belirle:
  - [ ] Opsiyon 1: `yt-dlp` ile search (Tauri command)
  - [x] Opsiyon 2: Kullanıcıdan video URL'si al
  - [ ] Opsiyon 3: YouTube embed search (sınırlı)
- [x] Seçilen opsiyonu implement et

#### C3. Audio Analyzer
- [x] `src/services/audio/analyzer.ts` oluştur
- [x] Web Audio API entegrasyonu (vanilla JS)
- [x] Audio stream'den feature extraction:
  - [x] Tempo (BPM) detection
  - [x] Energy (RMS loudness)
  - [x] Key detection (major/minor)
  - [x] Spectral features
- [x] Spotify-uyumlu format dönüşümü

```typescript
// src/services/audio/analyzer.ts
interface AnalysisResult {
  tempo: number;           // BPM
  energy: number;          // 0-1
  valence: number;         // 0-1 (tahmini)
  danceability: number;    // 0-1
  key: number;             // 0-11 (pitch class)
  mode: number;            // 0=minor, 1=major
}

export async function analyzeAudioUrl(url: string): Promise<AnalysisResult>;
```

#### C4. YouTube Provider
- [x] `YouTubeProvider` class oluştur
- [x] `MusicProvider` interface'i implement et
- [x] Playlist/library yönetimi (localStorage)
- [x] Audio analysis entegrasyonu
- [x] Cache (analiz sonuçları)

---

### Bölüm D: UI Güncellemeleri

#### D1. Provider Seçici
- [x] Settings'e provider dropdown ekle
- [x] Provider değişikliğinde state reset
- [x] Provider durumu göstergesi (bağlı/bağlı değil)

#### D2. YouTube Player UI
- [x] Gizli IFrame container (ses için)
- [x] Video thumbnail gösterimi
- [x] YouTube-spesifik kontroller (mevcut kontroller yeterli)

#### D3. Ollama Durumu
- [x] Settings'te Ollama status göstergesi
- [x] "Ollama çalışmıyor" uyarısı
- [x] Kurulum talimatları linki

#### D4. Loading States
- [x] Audio analysis için loading indicator
- [x] İlk embedding hesaplama için progress

#### D5. UI/UX Modernizasyonu (Premium Widget)
- [x] **Sharp Design:** Tüm yumuşatmalar (border-radius) kaldırıldı, keskin ve agresif industrial look sağlandı.
- [x] **Neon Aesthetic:** Spotify yeşilinden canlı neon cyan/purple gradient geçişine dönüldü.
- [x] **Glassmorphism:** Derin blur efektleri ve transparan paneller ile premium widget hissi.
- [x] **Draggable Background:** Pencere artık arka plandaki boş alanlardan tutularak taşınabiliyor.
- [x] **Improvisation Mode:** Kullanıcı şarkı seçtiğinde mood'un otomatik olarak o şarkıya adapte olması sağlandı.

---

### Bölüm E: Test ve Entegrasyon

#### E1. Unit Testler
- [x] Provider interface testleri
- [x] Embedding matcher testleri
- [x] Audio analyzer testleri (mock data ile)
- [x] Ollama service testleri

#### E2. Integration Testler
- [x] Mock Provider ile full flow
- [x] Provider switching
- [x] Fallback zincirleri

#### E3. Manual Test Senaryoları
- [x] YouTube video ekle → analiz et → mood match
- [x] Ollama kapalıyken fallback
- [x] Provider değiştirme

---

## Öncelik Sırası

```
Hafta 1: Temel Altyapı
├── A1. Provider Interface ⬅️ İLK BURADAN BAŞLA
├── A2. Spotify Refactor
└── A3. Mock Provider

Hafta 2: Ollama
├── B1. Ollama Service
├── B2. Preset Generator
├── B3. Embedding Matcher
└── B4-B5. Mood Engine

Hafta 3: YouTube
├── C1. IFrame Player
├── C2. Search
├── C3. Audio Analyzer
└── C4. YouTube Provider

Hafta 4: Polish
├── D1-D4. UI Updates
└── E1-E3. Testing
```

---

## Gerekli Kurulumlar

```bash
# Ollama (macOS)
brew install ollama
ollama serve  # Arka planda çalıştır

# Modeller (bir kere indir)
ollama pull llama3.2:3b      # ~2GB
ollama pull nomic-embed-text  # ~274MB

# Npm paketleri
pnpm add @xenova/transformers  # Alternatif: tarayıcıda embedding
pnpm add meyda                  # Audio analysis
```

---

## Dosya Yapısı (Faz 2 Sonrası)

```
src/
├── services/
│   ├── providers/
│   │   ├── index.ts           # Factory, interface
│   │   ├── spotify.ts         # SpotifyProvider
│   │   ├── youtube.ts         # YouTubeProvider
│   │   └── mock.ts            # MockProvider
│   ├── ai/
│   │   └── ollama.ts          # Ollama client
│   ├── audio/
│   │   └── analyzer.ts        # Audio feature extraction
│   ├── mood/
│   │   ├── engine.ts          # Ana mood engine
│   │   ├── embedMatcher.ts    # Embedding similarity
│   │   ├── ollamaParser.ts    # LLM parser
│   │   ├── keywordMapper.ts   # Keyword fallback
│   │   └── parser.ts          # OpenAI (legacy, opsiyonel)
│   └── youtube/
│       └── player.ts          # IFrame API wrapper
├── data/
│   └── mood-presets.json      # Üretilmiş preset'ler
└── scripts/
    └── generate-presets.ts    # Build-time preset üretici
```

---

## Notlar

- **Ollama opsiyonel:** Çalışmıyorsa keyword mapping devreye girer
- **YouTube ToS:** yt-dlp kullanımı gri alan, dikkatli ol
- **Audio analysis CPU-intensive:** İlk analiz yavaş, sonra cache'lenir
- **M2 Pro 16GB:** Tüm modeller rahat çalışır

---

*Bu döküman güncellenecektir. Her tamamlanan adımı ✅ ile işaretle.*
