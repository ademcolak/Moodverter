// LibrarySearch - YouTube search with debouncing and result display

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  searchVideos,
  getSearchSuggestions,
  addToSearchHistory,
  type YouTubeSearchResult,
} from '../services/youtube/search';
import { isYtDlpAvailable } from '../services/youtube/ytdlp';

interface LibrarySearchProps {
  currentMood?: string;
  onTrackSelect?: (track: YouTubeSearchResult) => void;
  onAddToLibrary?: (track: YouTubeSearchResult) => void;
}

export const LibrarySearch = ({
  currentMood,
  onTrackSelect,
  onAddToLibrary,
}: LibrarySearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ytdlpAvailable, setYtdlpAvailable] = useState<boolean | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check yt-dlp availability on mount
  useEffect(() => {
    isYtDlpAvailable().then(setYtdlpAvailable);
  }, []);

  // Update suggestions when mood changes
  useEffect(() => {
    const newSuggestions = getSearchSuggestions(currentMood, 5);
    setSuggestions(newSuggestions);
  }, [currentMood]);

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const searchResults = await searchVideos(searchQuery, 10);
      setResults(searchResults);

      if (searchResults.length === 0) {
        setError('Sonuc bulunamadi');
      }
    } catch (err) {
      console.error('Search failed:', err);
      setError(err instanceof Error ? err.message : 'Arama basarisiz oldu');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = (value: string) => {
    setQuery(value);
    setShowSuggestions(false);

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for debounced search (300ms)
    if (value.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(value);
      }, 300);
    } else {
      setResults([]);
      setError(null);
    }
  };

  // Handle search submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      addToSearchHistory(query);
      performSearch(query);
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    addToSearchHistory(suggestion);
    performSearch(suggestion);
    inputRef.current?.focus();
  };

  // Handle track click
  const handleTrackClick = (track: YouTubeSearchResult) => {
    onTrackSelect?.(track);
  };

  // Handle add to library
  const handleAddToLibrary = (track: YouTubeSearchResult, e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToLibrary?.(track);
  };

  // Format duration
  const formatDuration = (ms?: number): string => {
    if (!ms) return '--:--';
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format view count
  const formatViewCount = (count?: number): string => {
    if (!count) return '';
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toString();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search Input */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={ytdlpAvailable === false ? 'yt-dlp bulunamadi...' : 'Sarki veya sanatci ara...'}
            disabled={ytdlpAvailable === false}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                setError(null);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && !query && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-surface)] border border-white/10 z-10 max-h-40 overflow-y-auto">
            <div className="px-2 py-1 text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">
              Oneriler
            </div>
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full px-3 py-2 text-left text-sm text-[var(--color-text-primary)] hover:bg-white/5 flex items-center gap-2"
              >
                <svg className="w-3 h-3 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Error message */}
      {error && (
        <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="flex-1 mt-2 overflow-y-auto space-y-1">
          {results.map((track) => (
            <div
              key={track.videoId}
              onClick={() => handleTrackClick(track)}
              className="flex items-center gap-2 p-2 bg-white/5 hover:bg-white/10 cursor-pointer group transition-colors"
            >
              {/* Thumbnail */}
              <div className="w-10 h-10 flex-shrink-0 bg-black/20 overflow-hidden">
                {track.thumbnail && (
                  <img
                    src={track.thumbnail}
                    alt={track.title}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--color-text-primary)] truncate">
                  {track.title}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
                  <span className="truncate">{track.artist}</span>
                  {track.duration && (
                    <>
                      <span>-</span>
                      <span>{formatDuration(track.duration)}</span>
                    </>
                  )}
                  {track.viewCount && (
                    <>
                      <span>-</span>
                      <span>{formatViewCount(track.viewCount)} goruntulenme</span>
                    </>
                  )}
                </div>
              </div>

              {/* Add button */}
              <button
                onClick={(e) => handleAddToLibrary(track, e)}
                className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
                title="Kutupaneye ekle"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && results.length === 0 && query === '' && (
        <div className="flex-1 flex items-center justify-center text-center p-4">
          <div className="text-[var(--color-text-secondary)]">
            <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-xs">YouTube'da sarki ara</p>
            {currentMood && (
              <p className="text-[10px] mt-1 text-[var(--color-primary)]">
                Mood: {currentMood}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
