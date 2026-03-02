import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { LibrarySearch } from '../LibrarySearch';
import type { AnalysisState } from '../../services/transition';
import type { YouTubePlaylistAnalysis, YouTubeSearchResult } from '../../services/youtube/search';
import type { UnifiedTrack } from '../../types/provider';

interface PlaylistImportProgress {
  processed: number;
  total: number;
  added: number;
  skipped: number;
}

export interface LibraryPageProps {
  urlInput: string;
  playlistUrlInput: string;
  isSubmittingUrl: boolean;
  isPlaylistAnalyzing: boolean;
  isPlaylistImporting: boolean;
  playlistAnalysis: YouTubePlaylistAnalysis | null;
  playlistImportProgress: PlaylistImportProgress | null;
  playlistImportSummary: string | null;
  onUrlInputChange: (value: string) => void;
  onPlaylistUrlInputChange: (value: string) => void;
  onUrlSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAnalyzePlaylist: () => void;
  onImportPlaylist: () => void;
  onCancelPlaylistImport: () => void;
  tracks: UnifiedTrack[];
  isClearingLibrary: boolean;
  onClearAllTracks: () => void;
  analysisStates: Record<string, AnalysisState>;
  onPlayTrack: (trackId: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onSelectSearchResult: (track: YouTubeSearchResult) => void;
  onAddSearchResultToLibrary: (track: YouTubeSearchResult) => void;
  initialScrollTop: number;
  onLibraryScrollTopChange: (scrollTop: number) => void;
}

export function LibraryPage({
  urlInput,
  playlistUrlInput,
  isSubmittingUrl,
  isPlaylistAnalyzing,
  isPlaylistImporting,
  playlistAnalysis,
  playlistImportProgress,
  playlistImportSummary,
  onUrlInputChange,
  onPlaylistUrlInputChange,
  onUrlSubmit,
  onAnalyzePlaylist,
  onImportPlaylist,
  onCancelPlaylistImport,
  tracks,
  isClearingLibrary,
  onClearAllTracks,
  analysisStates,
  onPlayTrack,
  onRemoveTrack,
  onSelectSearchResult,
  onAddSearchResultToLibrary,
  initialScrollTop,
  onLibraryScrollTopChange,
}: LibraryPageProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const handleCloseModal = () => {
    if (isPlaylistImporting) return;
    setIsAddModalOpen(false);
  };
  const playlistProgressPercent = playlistImportProgress && playlistImportProgress.total > 0
    ? Math.round((playlistImportProgress.processed / playlistImportProgress.total) * 100)
    : 0;

  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const maxScrollTop = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
    listEl.scrollTop = Math.min(Math.max(0, initialScrollTop), maxScrollTop);
  }, [initialScrollTop]);

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      <section className="bg-[var(--color-surface)] border border-white/10 p-3 flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-2 gap-2">
          <h2 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
            Kütüphane
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">{tracks.length} şarkı</span>
            <button
              type="button"
              onClick={() => setIsClearConfirmOpen(true)}
              disabled={tracks.length === 0 || isClearingLibrary}
              className="btn btn--md btn--danger"
            >
              {isClearingLibrary ? 'Temizleniyor...' : 'Tümünü Kaldır'}
            </button>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="btn btn--md btn--ghost"
            >
              Ekle
            </button>
          </div>
        </div>

        {tracks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
            Henüz şarkı eklenmedi.
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 gap-2">
            <div className="w-8 shrink-0 h-full flex items-center justify-center">
              <div className="flex flex-col items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  aria-label="Kütüphane en üste git"
                  className="w-7 h-7 rounded-full border border-white/20 bg-black/45 text-[var(--color-text-primary)] text-[12px] hover:bg-black/65 transition-colors"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const listEl = listRef.current;
                  if (!listEl) return;
                  listEl.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' });
                }}
                  aria-label="Kütüphane en alta git"
                  className="w-7 h-7 rounded-full border border-white/20 bg-black/45 text-[var(--color-text-primary)] text-[12px] hover:bg-black/65 transition-colors"
                >
                  ↓
                </button>
              </div>
            </div>
            <div
              ref={listRef}
              onScroll={(event) => onLibraryScrollTopChange(event.currentTarget.scrollTop)}
              className="flex-1 h-full overflow-y-auto space-y-1 pr-1"
            >
              {tracks.map((track) => (
                <div
                  key={track.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onPlayTrack(track.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onPlayTrack(track.id);
                    }
                  }}
                  className="flex items-center gap-2 p-2 bg-white/5 border border-transparent hover:border-white/10 cursor-pointer"
                  title="Şarkıyı oynat"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-[var(--color-text-primary)] truncate">{track.name}</div>
                    <div className="text-xs text-[var(--color-text-secondary)] truncate">
                      {track.artist} • analiz: {analysisStates[track.id]?.status ?? 'yok'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveTrack(track.id);
                    }}
                    className="btn btn--xs btn--ghost btn--muted btn--danger-hover"
                    title="Şarkıyı kaldır"
                  >
                    Kaldır
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-3"
          onClick={handleCloseModal}
        >
          <div
            className="w-full max-w-[760px] max-h-[90vh] overflow-hidden bg-[var(--color-surface)] border border-white/10 p-3 flex flex-col gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Kütüphaneye Şarkı Ekle</h3>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPlaylistImporting}
                className="btn btn--sm btn--ghost"
              >
                Kapat
              </button>
            </div>

            <section className="border border-white/10 p-3 shrink-0">
              <h4 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
                YouTube Link Ekle
              </h4>
              <form
                onSubmit={(event) => {
                  onUrlSubmit(event);
                }}
                className="flex gap-2"
              >
                <input
                  value={urlInput}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => onUrlInputChange(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/10 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-primary)]"
                />
                <button
                  type="submit"
                  disabled={isSubmittingUrl}
                  className="btn btn--sm btn--primary"
                >
                  {isSubmittingUrl ? 'Ekleniyor...' : 'Ekle'}
                </button>
              </form>
            </section>

            <section className="border border-white/10 p-3 shrink-0">
              <h4 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
                YouTube Playlist İçe Aktar
              </h4>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={playlistUrlInput}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      onPlaylistUrlInputChange(event.target.value)}
                    disabled={isPlaylistAnalyzing || isPlaylistImporting}
                    placeholder="https://www.youtube.com/playlist?list=..."
                    className="flex-1 px-3 py-2 bg-white/5 border border-white/10 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-primary)] disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={onAnalyzePlaylist}
                    disabled={!playlistUrlInput.trim() || isPlaylistAnalyzing || isPlaylistImporting}
                    className="btn btn--sm btn--ghost"
                  >
                    {isPlaylistAnalyzing ? 'Analiz...' : 'Analiz Et'}
                  </button>
                </div>

                {playlistAnalysis && (
                  <div className="border border-white/10 bg-black/10 px-3 py-2 space-y-2">
                    <div className="text-xs text-[var(--color-text-primary)] truncate">
                      {playlistAnalysis.playlistTitle ?? 'YouTube Playlist'}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-secondary)]">
                      Toplam {playlistAnalysis.totalEntries} • Geçerli {playlistAnalysis.validEntries} • Atlanan {playlistAnalysis.skippedEntries} • Private/Silinmiş {playlistAnalysis.unavailableEntries}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onImportPlaylist}
                        disabled={playlistAnalysis.validEntries === 0 || isPlaylistImporting}
                        className="btn btn--sm btn--primary"
                      >
                        {isPlaylistImporting ? 'Aktarılıyor...' : 'Tümünü Aktar'}
                      </button>
                      {isPlaylistImporting && (
                        <button
                          type="button"
                          onClick={onCancelPlaylistImport}
                          className="btn btn--sm btn--ghost"
                        >
                          İptal Et
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {playlistImportProgress && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-primary)] transition-[width] duration-150"
                        style={{ width: `${playlistProgressPercent}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-[var(--color-text-secondary)]">
                      Aktarım: {playlistImportProgress.processed}/{playlistImportProgress.total} ({playlistProgressPercent}%) • Eklenen {playlistImportProgress.added} • Atlanan {playlistImportProgress.skipped}
                    </div>
                  </div>
                )}
                {playlistImportSummary && (
                  <div className="text-[11px] text-emerald-300">
                    {playlistImportSummary}
                  </div>
                )}
              </div>
            </section>

            <section className="border border-white/10 p-3 flex-1 min-h-0 overflow-hidden">
              <h4 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
                YouTube Arama
              </h4>
              <div className="h-64 border border-white/10 bg-[var(--color-background)]">
                <LibrarySearch
                  onTrackSelect={(track) => {
                    onSelectSearchResult(track);
                    setIsAddModalOpen(false);
                  }}
                  onAddToLibrary={(track) => onAddSearchResultToLibrary(track)}
                />
              </div>
            </section>
          </div>
        </div>
      )}

      {isClearConfirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3"
          onClick={() => {
            if (isClearingLibrary) return;
            setIsClearConfirmOpen(false);
          }}
        >
          <div
            className="w-full max-w-[420px] bg-[var(--color-surface)] border border-white/10 p-4 space-y-3"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Emin misin?
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Kütüphanedeki tüm şarkılar kaldırılacak.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsClearConfirmOpen(false)}
                disabled={isClearingLibrary}
                className="btn btn--sm btn--ghost"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsClearConfirmOpen(false);
                  onClearAllTracks();
                }}
                disabled={isClearingLibrary}
                className="btn btn--sm btn--danger"
              >
                Evet, Tümünü Kaldır
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
