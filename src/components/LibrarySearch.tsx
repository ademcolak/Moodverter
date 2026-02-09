import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addToSearchHistory,
  getSearchSuggestions,
  searchVideos,
  type YouTubeSearchResult,
} from '../services/youtube/search';

interface LibrarySearchProps {
  onTrackSelect?: (track: YouTubeSearchResult) => void;
  onAddToLibrary?: (track: YouTubeSearchResult) => void;
}

export const LibrarySearch = ({ onTrackSelect, onAddToLibrary }: LibrarySearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSearchRequestRef = useRef(0);

  useEffect(() => {
    setSuggestions(getSearchSuggestions(5));
  }, []);

  const performSearch = useCallback(async (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      setResults([]);
      setError(null);
      return;
    }

    const requestId = ++activeSearchRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const searchResults = await searchVideos(normalized, 6);
      if (requestId !== activeSearchRequestRef.current) return;
      setResults(searchResults);
      if (searchResults.length === 0) {
        setError('Sonuc bulunamadi.');
      }
    } catch (err) {
      if (requestId !== activeSearchRequestRef.current) return;
      console.error('Search failed:', err);
      setResults([]);
      setError('Arama basarisiz oldu.');
    } finally {
      if (requestId === activeSearchRequestRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!value.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    if (value.trim().length < 3) {
      setResults([]);
      setError(null);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      void performSearch(value);
    }, 450);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    addToSearchHistory(query);
    setSuggestions(getSearchSuggestions(5));
    void performSearch(query);
  };

  const handleSuggestionClick = (value: string) => {
    setQuery(value);
    setShowSuggestions(false);
    addToSearchHistory(value);
    setSuggestions(getSearchSuggestions(5));
    void performSearch(value);
  };

  const formatDuration = (ms?: number): string => {
    if (!ms) return '--:--';
    const seconds = Math.floor(ms / 1000);
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={query}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="YouTube sarki ara..."
          className="w-full px-3 py-2 bg-white/5 border border-white/10 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-primary)] disabled:opacity-60"
        />

        {showSuggestions && suggestions.length > 0 && !query.trim() && (
          <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-[var(--color-surface)] border border-white/10 max-h-36 overflow-y-auto">
            {suggestions.map((item, index) => (
              <button
                key={`${item}-${index}`}
                type="button"
                onClick={() => handleSuggestionClick(item)}
                className="w-full px-3 py-2 text-left text-sm text-[var(--color-text-primary)] hover:bg-white/5"
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </form>

      {error && (
        <div className="mt-2 px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-2 text-xs text-[var(--color-text-secondary)]">Araniyor...</div>
      )}

      <div className="flex-1 mt-2 overflow-y-auto space-y-1">
        {results.map((track) => (
          <div
            key={track.videoId}
            onClick={() => onTrackSelect?.(track)}
            className="flex items-center gap-2 p-2 bg-white/5 hover:bg-white/10 cursor-pointer group"
          >
            <div className="w-10 h-10 bg-black/20 overflow-hidden shrink-0">
              {track.thumbnail && (
                <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[var(--color-text-primary)] truncate">{track.title}</div>
              <div className="text-[10px] text-[var(--color-text-secondary)] truncate">
                {track.artist} {track.duration ? `- ${formatDuration(track.duration)}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAddToLibrary?.(track);
              }}
              className="px-2 py-1 text-xs border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              Ekle
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
