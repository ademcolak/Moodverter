# Faz 3.2: Keşif Sistemi & UX Geliştirmeleri

> **Hedef:** Akıllı keşif modu, kullanıcı kontrollü öneri sistemi, gelişmiş UX özellikleri
>
> **Önkoşul:** Faz 3.1 (UI/UX İyileştirmeleri) tamamlanmış olmalı

---

## Özet

Bu fazda 6 ana geliştirme yapılacak:

| # | Özellik | Öncelik | Bağımlılık |
|---|---------|---------|------------|
| 1 | Keşif Ayarları Sistemi | KRİTİK | - |
| 2 | YouTube Akıllı Arama | KRİTİK | #1 |
| 3 | Klavye Kısayolları | YÜKSEK | - |
| 4 | Queue Görünümü | YÜKSEK | - |
| 5 | Çalma Geçmişi | ORTA | #4 |
| 6 | Bilgi Tooltip Sistemi | ORTA | #1 |

---

## Bölüm A: Keşif Ayarları Sistemi

### A1. Keşif Modu Enum & State

**Yeni Tip Tanımları:**
```typescript
// src/types/discovery.ts
export type DiscoveryMode = 'library_only' | 'suggest' | 'auto_discover';

export interface DiscoverySettings {
  mode: DiscoveryMode;
  minLibraryThreshold: number;    // Bu sayının altında keşif aktif (default: 5)
  autoAddToLibrary: boolean;      // Otomatik keşifte beğenileni ekle
  preferSimilarArtists: boolean;  // Aynı sanatçıdan öncelikli ara
}

export const DISCOVERY_MODE_INFO: Record<DiscoveryMode, {
  title: string;
  description: string;
  icon: string;
}> = {
  library_only: {
    title: 'Sadece Kütüphane',
    description: 'Yalnızca eklediğin şarkılar arasından çalar. Yeni şarkı önermez.',
    icon: '📚'
  },
  suggest: {
    title: 'Öneri Göster',
    description: 'Kütüphane yetersizken mood\'a uygun şarkılar önerir. Sen seçersin, otomatik çalmaz.',
    icon: '💡'
  },
  auto_discover: {
    title: 'Otomatik Keşfet',
    description: 'Kütüphanede uygun şarkı yoksa YouTube\'dan otomatik bulur ve çalar.',
    icon: '🚀'
  }
};
```

**Yapılacaklar:**
- [x] `src/types/discovery.ts` oluştur
- [x] Discovery mode enum ve interface tanımla
- [x] Mode açıklamaları için DISCOVERY_MODE_INFO objesi
- [x] Default settings: `{ mode: 'suggest', minLibraryThreshold: 5 }`

---

### A2. Settings State Güncellemesi

**App.tsx State Güncellemesi:**
```typescript
const [settings, setSettings] = useState({
  openToNewSongs: true,
  spotifyConnected: false,
  openAiApiKey: '',
  provider: 'mock' as ProviderType,
  // YENİ
  discovery: {
    mode: 'suggest' as DiscoveryMode,
    minLibraryThreshold: 5,
    autoAddToLibrary: false,
    preferSimilarArtists: true,
  }
});
```

**Yapılacaklar:**
- [x] App.tsx'de settings state'ine discovery ekle
- [x] localStorage'dan discovery settings oku/yaz
- [x] Settings değiştiğinde persist et

---

### A3. Settings UI - Keşif Tab'ı

**Yeni Tab Ekleme:**
```typescript
// Settings.tsx - TABS array'ine ekle
{
  id: 'discovery',
  label: 'Keşif',
  icon: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
}
```

**Tab İçeriği Tasarımı:**
```
┌─────────────────────────────────────────────────┐
│  Keşif Modu                              [i]    │
├─────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────┐  │
│  │ ○ 📚 Sadece Kütüphane                     │  │
│  │   Yalnızca eklediğin şarkılar             │  │
│  ├───────────────────────────────────────────┤  │
│  │ ● 💡 Öneri Göster (Önerilen)              │  │
│  │   Mood'a uygun şarkılar önerir            │  │
│  ├───────────────────────────────────────────┤  │
│  │ ○ 🚀 Otomatik Keşfet                      │  │
│  │   Otomatik bulur ve çalar                 │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  Keşif Eşiği                             [i]    │
│  ┌─────────────────────────────────────────┐    │
│  │  Kütüphanede [5] şarkıdan az varsa      │    │
│  │  keşif modunu aktifleştir               │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Ek Ayarlar                                     │
│  ┌─────────────────────────────────────────┐    │
│  │ Beğenileni otomatik ekle      [  OFF  ] │    │
│  │ Benzer sanatçıları tercih et  [  ON   ] │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

**Yapılacaklar:**
- [x] Settings.tsx'e 'discovery' tab ekle
- [x] Radio button group ile mode seçimi
- [x] Number input ile threshold ayarı
- [x] Toggle switch'ler ile ek ayarlar
- [x] Her ayarın yanında [i] info butonu

---

### A4. Info Tooltip Bileşeni

**Yeni Bileşen:**
```typescript
// src/components/InfoTooltip.tsx
interface InfoTooltipProps {
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const InfoTooltip = ({ title, description, position = 'top' }: InfoTooltipProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-4 h-4 rounded-full bg-white/10 text-[10px]
                   text-[var(--color-text-secondary)] hover:bg-white/20
                   flex items-center justify-center"
      >
        i
      </button>

      {isOpen && (
        <div className="absolute z-50 w-64 p-3 bg-[var(--color-surface)]
                        border border-white/10 shadow-xl ...">
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
            {title}
          </h4>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {description}
          </p>
        </div>
      )}
    </div>
  );
};
```

**Yapılacaklar:**
- [x] `src/components/InfoTooltip.tsx` oluştur
- [x] Click-to-open/close mekanizması
- [x] Dışarı tıklayınca kapansın
- [x] Position prop ile yön ayarı
- [x] components/index.ts'e export ekle

---

## Bölüm B: YouTube Akıllı Arama (Keşif Entegrasyonu)

### B1. Discovery Service

**Yeni Servis:**
```typescript
// src/services/discovery/index.ts
import { searchYouTube } from '../youtube/search';
import { selectNextTrack } from '../navigator/selector';

interface DiscoveryResult {
  source: 'library' | 'youtube';
  track: UnifiedTrack;
  reason: string;
}

export async function discoverNextTrack(
  library: UnifiedTrack[],
  moodParams: MoodParameters,
  currentTrack: UnifiedTrack | null,
  settings: DiscoverySettings
): Promise<DiscoveryResult | null> {

  // 1. Önce kütüphaneden dene
  const libraryResult = selectNextTrack(library, {
    moodParams,
    currentTrack,
    recentTracks: [],
    includeRecommendations: true,
  });

  // Kütüphane yeterliyse kullan
  if (libraryResult && library.length >= settings.minLibraryThreshold) {
    return {
      source: 'library',
      track: libraryResult.track,
      reason: 'Kütüphanenden'
    };
  }

  // 2. Keşif modu kontrolü
  if (settings.mode === 'library_only') {
    return libraryResult ? {
      source: 'library',
      track: libraryResult.track,
      reason: 'Kütüphanenden'
    } : null;
  }

  // 3. YouTube'dan ara
  const searchQuery = buildMoodSearchQuery(moodParams, currentTrack);
  const youtubeResults = await searchYouTube(searchQuery, 10);

  if (youtubeResults.length === 0) {
    return libraryResult ? {
      source: 'library',
      track: libraryResult.track,
      reason: 'Kütüphanenden (keşif sonuç vermedi)'
    } : null;
  }

  // 4. En uygun YouTube sonucunu seç
  const bestMatch = selectBestYouTubeMatch(youtubeResults, moodParams, settings);

  return {
    source: 'youtube',
    track: bestMatch,
    reason: 'YouTube keşif'
  };
}

function buildMoodSearchQuery(mood: MoodParameters, current: UnifiedTrack | null): string {
  const parts: string[] = [];

  // Energy-based keywords
  if (mood.energy > 0.7) parts.push('energetic', 'upbeat');
  else if (mood.energy < 0.3) parts.push('calm', 'relaxing');

  // Valence-based keywords
  if (mood.valence > 0.7) parts.push('happy', 'positive');
  else if (mood.valence < 0.3) parts.push('melancholic', 'emotional');

  // Add genre hint from current track
  if (current?.genres?.length) {
    parts.push(current.genres[0]);
  }

  // Add "music" to ensure music results
  parts.push('music');

  return parts.join(' ');
}
```

**Yapılacaklar:**
- [x] `src/services/discovery/index.ts` oluştur
- [x] `discoverNextTrack()` ana fonksiyonu
- [x] `buildMoodSearchQuery()` - mood'dan arama query'si
- [x] `selectBestYouTubeMatch()` - sonuçlar arasından seç
- [x] Kütüphane threshold kontrolü

---

### B2. Suggest Mode UI (Öneri Paneli)

**Yeni Bileşen:**
```typescript
// src/components/DiscoverySuggestions.tsx
interface DiscoverySuggestionsProps {
  suggestions: UnifiedTrack[];
  isLoading: boolean;
  onSelect: (track: UnifiedTrack) => void;
  onAddToLibrary: (track: UnifiedTrack) => void;
  onDismiss: () => void;
}
```

**UI Tasarımı:**
```
┌─────────────────────────────────────────────┐
│ 💡 Keşif Önerileri                     [×]  │
├─────────────────────────────────────────────┤
│ Kütüphanende bu mood'a uygun şarkı az.      │
│ İşte sana birkaç öneri:                     │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 🎵 Song Title - Artist          [+] [▶] │ │
│ │ 🎵 Another Song - Artist        [+] [▶] │ │
│ │ 🎵 Third Song - Artist          [+] [▶] │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Daha Fazla Göster]                         │
└─────────────────────────────────────────────┘

[+] = Kütüphaneye ekle
[▶] = Hemen çal
```

**Yapılacaklar:**
- [x] `src/components/DiscoverySuggestions.tsx` oluştur
- [x] Önerileri liste halinde göster
- [x] Her öneride: çal, kütüphaneye ekle butonları
- [x] Dismiss butonu ile kapat
- [x] Loading state
- [x] "Daha fazla" butonu ile pagination

---

### B3. Auto-Discover Entegrasyonu

**App.tsx handleTrackChange Güncellemesi:**
```typescript
// Auto-play next track when current track ends naturally
if (event.type === 'natural' && settings.discovery.mode !== 'library_only') {
  try {
    const result = await discoverNextTrack(
      libraryTracks,
      moodParams,
      event.previousTrack,
      settings.discovery
    );

    if (result) {
      // Auto-discover modunda direkt çal
      if (settings.discovery.mode === 'auto_discover') {
        await playTrack(result.track);

        // Beğenileni otomatik ekle ayarı açıksa
        if (settings.discovery.autoAddToLibrary && result.source === 'youtube') {
          addToLibrary(result.track);
        }
      }
      // Suggest modunda önerileri göster
      else if (settings.discovery.mode === 'suggest' && result.source === 'youtube') {
        setDiscoverySuggestions([result.track]);
        setShowSuggestions(true);
      }
    }
  } catch (err) {
    console.error('Discovery failed:', err);
  }
}
```

**Yapılacaklar:**
- [x] App.tsx'de discovery entegrasyonu
- [x] Auto-discover modunda otomatik çalma
- [x] Suggest modunda panel gösterme
- [x] autoAddToLibrary desteği

---

### B4. Discovery Status Indicator

**Now Playing'e Ekleme:**
```
┌─────────────────────────────────────────────┐
│ 🎵 [Album Art]  Song Title                  │
│                 Artist                      │
│                 ───────────────────         │
│                 🔍 YouTube keşif            │  ← YENİ: Kaynak göster
│ ────────────────────────────────────────    │
│ [Progress Bar]                              │
│ 0:45 ─────────────────────────────── 3:21   │
└─────────────────────────────────────────────┘
```

**Yapılacaklar:**
- [x] NowPlaying'e source badge ekle
- [x] "Kütüphanenden" / "YouTube keşif" göster
- [x] Küçük ve unobtrusive tasarım

---

## Bölüm C: Klavye Kısayolları

### C1. Keyboard Hook

**Yeni Hook:**
```typescript
// src/hooks/useKeyboardShortcuts.ts
interface KeyboardShortcuts {
  'Space': () => void;           // Play/Pause
  'ArrowRight': () => void;      // Skip next
  'ArrowLeft': () => void;       // Skip previous
  'ArrowUp': () => void;         // Volume up (future)
  'ArrowDown': () => void;       // Volume down (future)
  'm': () => void;               // Mute toggle (future)
  'Escape': () => void;          // Close modals
  's': () => void;               // Open settings
  '/': () => void;               // Focus search
}

export function useKeyboardShortcuts(shortcuts: Partial<KeyboardShortcuts>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Input/textarea içindeyken çalışmasın
      if (e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key;
      const handler = shortcuts[key as keyof KeyboardShortcuts];

      if (handler) {
        e.preventDefault();
        handler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
```

**Yapılacaklar:**
- [x] `src/hooks/useKeyboardShortcuts.ts` oluştur
- [x] Input alanlarında devre dışı kalmalı
- [x] preventDefault ile browser default'larını engelle
- [x] hooks/index.ts'e export ekle

---

### C2. App.tsx Entegrasyonu

```typescript
// App.tsx
useKeyboardShortcuts({
  'Space': handlePlayPause,
  'ArrowRight': effectiveSkipNext,
  'ArrowLeft': effectiveSkipPrevious,
  'Escape': () => setIsSettingsOpen(false),
  's': () => setIsSettingsOpen(true),
  '/': () => document.querySelector<HTMLInputElement>('.mood-input')?.focus(),
});
```

**Yapılacaklar:**
- [x] App.tsx'de useKeyboardShortcuts kullan
- [x] Temel kısayolları bağla
- [x] MoodInput'a className ekle (focus için)

---

### C3. Kısayol Yardım Paneli

**UI Tasarımı:**
```
Sağ alt köşede küçük "?" butonu

Tıklanınca:
┌─────────────────────────────────────┐
│ ⌨️ Klavye Kısayolları               │
├─────────────────────────────────────┤
│ Space      Çal / Duraklat           │
│ →          Sonraki şarkı            │
│ ←          Önceki şarkı             │
│ S          Ayarları aç              │
│ /          Mood girişine odaklan    │
│ Esc        Pencereyi kapat          │
└─────────────────────────────────────┘
```

**Yapılacaklar:**
- [x] `src/components/KeyboardHelp.tsx` oluştur
- [x] Sağ alt köşede "?" butonu
- [x] Hover veya click ile panel aç
- [x] Kısayol listesi

---

## Bölüm D: Queue Görünümü

### D1. Queue State

**Yeni State & Types:**
```typescript
// src/types/queue.ts
export interface QueueItem {
  id: string;
  track: UnifiedTrack;
  source: 'library' | 'discovery' | 'manual';
  addedAt: number;
}

export interface QueueState {
  items: QueueItem[];
  currentIndex: number;
  history: QueueItem[];  // Geçmişte çalananlar
}
```

**Yapılacaklar:**
- [x] `src/types/queue.ts` oluştur
- [x] QueueItem ve QueueState interface'leri
- [x] App.tsx'de queue state ekle

---

### D2. Queue Service

```typescript
// src/services/queue/index.ts
export function createQueueManager(initialState?: QueueState) {
  let state: QueueState = initialState || {
    items: [],
    currentIndex: -1,
    history: [],
  };

  return {
    addToQueue: (track: UnifiedTrack, source: QueueItem['source']) => {...},
    removeFromQueue: (id: string) => {...},
    reorder: (fromIndex: number, toIndex: number) => {...},
    getNext: () => {...},
    getPrevious: () => {...},
    clear: () => {...},
    getState: () => state,
  };
}
```

**Yapılacaklar:**
- [x] `src/services/queue/index.ts` oluştur
- [x] Queue yönetim fonksiyonları
- [x] Reorder (sürükle-bırak için)
- [x] History tracking

---

### D3. Queue Panel UI

**Tasarım:**
```
NowPlaying'in altında veya yanında açılır panel

┌─────────────────────────────────────────────┐
│ 📋 Sıradaki (3)                    [Temizle]│
├─────────────────────────────────────────────┤
│ ≡ 1. Song Title - Artist               [×] │
│ ≡ 2. Another Song - Artist             [×] │
│ ≡ 3. Third Song - Artist               [×] │
├─────────────────────────────────────────────┤
│             [+ Şarkı Ekle]                  │
└─────────────────────────────────────────────┘

≡ = Sürükle-bırak handle
[×] = Sıradan çıkar
```

**Yapılacaklar:**
- [x] `src/components/QueuePanel.tsx` oluştur
- [x] Sıradaki şarkıları listele
- [x] Sürükle-bırak ile sıralama (react-beautiful-dnd veya native)
- [x] Şarkı silme butonu
- [x] Temizle butonu
- [x] Collapse/expand özelliği

---

### D4. Queue Toggle Butonu

```typescript
// NowPlaying'e ekle
<button
  onClick={() => setShowQueue(!showQueue)}
  className="p-1.5 text-[var(--color-text-secondary)]
             hover:text-[var(--color-text-primary)]"
  title="Sırayı göster"
>
  <svg className="w-4 h-4" ...>
    {/* Queue icon */}
  </svg>
  {queueCount > 0 && (
    <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--color-primary)]
                     text-[10px] text-white rounded-full">
      {queueCount}
    </span>
  )}
</button>
```

**Yapılacaklar:**
- [x] NowPlaying'e queue toggle butonu ekle
- [x] Badge ile sıradaki şarkı sayısı
- [x] Panel açma/kapama state'i

---

## Bölüm E: Çalma Geçmişi

### E1. History State

```typescript
// src/types/history.ts
export interface HistoryEntry {
  track: UnifiedTrack;
  playedAt: number;
  listenDuration: number;  // ms
  completedPercent: number;
  mood?: string;           // O anki mood input
  source: 'library' | 'discovery';
}
```

**Yapılacaklar:**
- [x] `src/types/history.ts` oluştur
- [x] HistoryEntry interface
- [x] localStorage persistence

---

### E2. History Service

```typescript
// src/services/history/index.ts
const HISTORY_LIMIT = 100;
const STORAGE_KEY = 'moodverter_history';

export function addToHistory(entry: Omit<HistoryEntry, 'playedAt'>) {...}
export function getHistory(limit?: number): HistoryEntry[] {...}
export function clearHistory() {...}
export function getHistoryStats(): {
  totalTracks: number;
  totalListenTime: number;
  topArtists: { artist: string; count: number }[];
  topMoods: { mood: string; count: number }[];
} {...}
```

**Yapılacaklar:**
- [x] `src/services/history/index.ts` oluştur
- [x] History CRUD fonksiyonları
- [x] İstatistik hesaplama
- [x] localStorage persist/load

---

### E3. History Panel UI

**Tasarım:**
```
Queue panelinin yanında tab olarak veya ayrı panel

┌─────────────────────────────────────────────┐
│ 🕐 Geçmiş                            [Sil]  │
├─────────────────────────────────────────────┤
│ ▸ Bugün                                     │
│   🎵 Song 1 - Artist          14:32  [▶]   │
│   🎵 Song 2 - Artist          14:28  [▶]   │
│                                             │
│ ▸ Dün                                       │
│   🎵 Song 3 - Artist          22:15  [▶]   │
│   ...                                       │
└─────────────────────────────────────────────┘
```

**Yapılacaklar:**
- [x] `src/components/HistoryPanel.tsx` oluştur
- [x] Tarihe göre grupla
- [x] Tekrar çal butonu
- [x] Geçmişi temizle

---

## Bölüm F: Info Tooltip Sistemi (Detay)

### F1. Tooltip Pozisyon Hesaplama

```typescript
// Viewport dışına taşmayı önle
function calculatePosition(
  triggerRect: DOMRect,
  tooltipSize: { width: number; height: number },
  preferredPosition: 'top' | 'bottom' | 'left' | 'right'
): { x: number; y: number; actualPosition: string } {
  // Smart positioning logic
}
```

**Yapılacaklar:**
- [x] InfoTooltip'e akıllı pozisyonlama ekle
- [x] Viewport boundary detection
- [x] Auto-flip (yer yoksa ters tarafa)

---

### F2. Tooltip İçerik Varyantları

```typescript
// Farklı içerik türleri
interface TooltipContent {
  variant: 'info' | 'warning' | 'tip';
  title: string;
  description: string;
  learnMoreUrl?: string;
}
```

**Yapılacaklar:**
- [x] Variant bazlı stil (info=mavi, warning=sarı, tip=yeşil)
- [x] Opsiyonel "Daha fazla bilgi" linki
- [x] Animasyonlu açılış

---

## Uygulama Sırası

```
Adım 1: Temel Altyapı (A1-A4)
├── Discovery types ve state
├── Settings UI güncellemesi
└── InfoTooltip bileşeni

Adım 2: Keşif Sistemi (B1-B4)
├── Discovery service
├── Suggest mode UI
├── Auto-discover entegrasyonu
└── Status indicator

Adım 3: Klavye & UX (C1-C3)
├── Keyboard shortcuts hook
├── App entegrasyonu
└── Yardım paneli

Adım 4: Queue Sistemi (D1-D4)
├── Queue state ve service
├── Queue panel UI
└── Toggle butonu

Adım 5: Geçmiş (E1-E3)
├── History types ve service
├── Panel UI
└── İstatistikler

Adım 6: Polish (F1-F2)
├── Tooltip iyileştirmeleri
└── Genel UI polish
```

---

## Dosya Yapısı

```
src/
├── types/
│   ├── discovery.ts        [YENİ]
│   ├── queue.ts            [YENİ]
│   └── history.ts          [YENİ]
├── services/
│   ├── discovery/
│   │   └── index.ts        [YENİ]
│   ├── queue/
│   │   └── index.ts        [YENİ]
│   └── history/
│       └── index.ts        [YENİ]
├── hooks/
│   ├── useKeyboardShortcuts.ts  [YENİ]
│   └── index.ts            [GÜNCELLE]
├── components/
│   ├── InfoTooltip.tsx     [YENİ]
│   ├── DiscoverySuggestions.tsx [YENİ]
│   ├── KeyboardHelp.tsx    [YENİ]
│   ├── QueuePanel.tsx      [YENİ]
│   ├── HistoryPanel.tsx    [YENİ]
│   ├── Settings.tsx        [GÜNCELLE - discovery tab]
│   ├── NowPlaying.tsx      [GÜNCELLE - source badge, queue toggle]
│   └── index.ts            [GÜNCELLE]
└── App.tsx                 [GÜNCELLE - discovery state, keyboard]
```

---

## Test Planı

### Keşif Sistemi
- [ ] Library_only: YouTube araması yapılmıyor
- [ ] Suggest: Öneriler gösteriliyor, otomatik çalmıyor
- [ ] Auto_discover: Otomatik arama ve çalma
- [ ] Threshold altında keşif aktifleşiyor
- [ ] autoAddToLibrary çalışıyor

### Klavye Kısayolları
- [ ] Space: play/pause toggle
- [ ] Arrow keys: skip next/previous
- [ ] S: settings açılıyor
- [ ] /: mood input'a focus
- [ ] Esc: modal kapatıyor
- [ ] Input içindeyken çalışmıyor

### Queue
- [ ] Şarkı ekleme/çıkarma
- [ ] Sürükle-bırak sıralama
- [ ] Queue'dan çalma
- [ ] Temizleme

### Geçmiş
- [ ] Çalınan şarkılar kaydediliyor
- [ ] Tarihe göre gruplu
- [ ] Tekrar çalma çalışıyor
- [ ] Persist/load çalışıyor

---

## Notlar

- Discovery mode değişikliği anında etkili olmalı
- Queue ve History localStorage'da persist edilmeli
- Keyboard shortcuts sistem genelinde çalışmalı (modal açıkken bile Esc)
- InfoTooltip mobil'de de çalışmalı (touch events)
- Queue'da maksimum 50 şarkı limiti koyulabilir
