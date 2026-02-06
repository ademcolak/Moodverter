// Discovery settings and modes

export type DiscoveryMode = 'library_only' | 'suggest' | 'auto_discover';
export type SuggestBehavior = 'show_only' | 'show_with_autoplay_fallback';

export interface DiscoverySettings {
  mode: DiscoveryMode;
  minLibraryThreshold: number;
  autoAddToLibrary: boolean;
  preferSimilarArtists: boolean;
  suggestBehavior: SuggestBehavior;
  suggestAutoplayDelaySec: number;
  maxSuggestionsPerCycle: number;
}

export const DEFAULT_DISCOVERY_SETTINGS: DiscoverySettings = {
  mode: 'suggest',
  minLibraryThreshold: 5,
  autoAddToLibrary: false,
  preferSimilarArtists: true,
  suggestBehavior: 'show_with_autoplay_fallback',
  suggestAutoplayDelaySec: 8,
  maxSuggestionsPerCycle: 5,
};

export const DISCOVERY_MODE_INFO: Record<DiscoveryMode, {
  title: string;
  description: string;
  icon: string;
}> = {
  library_only: {
    title: 'Sadece Kutuphane',
    description: 'Yalnizca ekledigin sarkilar arasindan calar. Yeni sarki onermez.',
    icon: '📚',
  },
  suggest: {
    title: 'Oneri Goster',
    description: 'Kutuphane yetersizken mood\'a uygun sarkilar onerir. Sen secersin.',
    icon: '💡',
  },
  auto_discover: {
    title: 'Otomatik Kesfet',
    description: 'Kutuphanede uygun sarki yoksa YouTube\'dan otomatik bulur ve calar.',
    icon: '🚀',
  },
};
