import type { TransitionCandidate } from '../../services/transition';
import type { UnifiedTrack } from '../../types/provider';

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function buildReasonLabel(candidate: TransitionCandidate): string {
  switch (candidate.diagnostic.primaryDriver) {
    case 'rhythm':
      return 'Ritim ve tempo uyumu güçlü.';
    case 'event':
      return 'Geçiş anı uyumu güçlü.';
    case 'embedding':
      return 'Genel doku benzerliği iyi.';
    case 'loudness':
      return 'Ses seviyesi geçişe uygun.';
    case 'penalty':
    default:
      return 'Genel uyum iyi, geçiş için uygun aday.';
  }
}

export interface TransitionPageProps {
  currentTrack: UnifiedTrack | null;
  transitionCandidates: TransitionCandidate[];
  libraryTrackMap: Map<string, UnifiedTrack>;
  isTransitionLoading: boolean;
  transitionError: string | null;
  isAutoTransitioning: boolean;
  autoTransitionLeadMs: number;
  lastAutoTransitionLatencyMs: number | null;
  autoDecisionSummary: string | null;
  manualSuggestionReasons: string[];
  suggestedManualCandidate: TransitionCandidate | null;
  canSendFeedback: boolean;
  lastFeedbackLabel: string | null;
  onRefreshCandidates: () => void;
  onApplySuggestedManual: () => void;
  onNowTransition: (candidate: TransitionCandidate) => void;
  onSubmitFeedback: (value: 'good' | 'ok' | 'bad') => void;
}

export function TransitionPage({
  currentTrack,
  transitionCandidates,
  libraryTrackMap,
  isTransitionLoading,
  transitionError,
  isAutoTransitioning,
  autoTransitionLeadMs,
  lastAutoTransitionLatencyMs,
  autoDecisionSummary,
  manualSuggestionReasons,
  suggestedManualCandidate,
  canSendFeedback,
  lastFeedbackLabel,
  onRefreshCandidates,
  onApplySuggestedManual,
  onNowTransition,
  onSubmitFeedback,
}: TransitionPageProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col gap-4">
      <section className="bg-[var(--color-surface)] border border-white/10 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)] mb-1">
              Şu An Çalan
            </h2>
            <div className="text-sm text-[var(--color-text-primary)] truncate">
              {currentTrack ? currentTrack.name : 'Önce bir şarkı çal'}
            </div>
            <div className="text-xs text-[var(--color-text-secondary)] truncate">
              {currentTrack ? currentTrack.artist : 'Transition önerileri çalma başladıktan sonra görünür'}
            </div>
          </div>
          <button
            type="button"
            onClick={onRefreshCandidates}
            disabled={!currentTrack}
            className="px-3 py-2 text-xs border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            Önerileri Yenile
          </button>
        </div>

        <div className="mt-2 text-[11px] text-[var(--color-text-secondary)]">
          Otomatik geçiş: {isAutoTransitioning ? 'geçiş yapılıyor...' : 'aktif'}
          {' | '}
          Hazırlık payı: {Math.round(autoTransitionLeadMs / 10) / 100} sn
          {lastAutoTransitionLatencyMs !== null ? ` | Son geçiş ${lastAutoTransitionLatencyMs}ms` : ''}
        </div>
        {autoDecisionSummary && (
          <div className="mt-1 text-[11px] text-amber-300">
            {autoDecisionSummary}
          </div>
        )}
        {suggestedManualCandidate && (
          <div className="mt-2 border border-amber-400/30 bg-amber-500/10 px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <div
                className="text-[11px] text-amber-200 truncate"
                title={manualSuggestionReasons.join(' + ')}
              >
                Onerilen manuel gecis: {libraryTrackMap.get(suggestedManualCandidate.targetTrackId)?.name ?? suggestedManualCandidate.targetTrackId}
              </div>
              <button
                type="button"
                onClick={onApplySuggestedManual}
                className="px-2 py-1 text-[10px] border border-amber-300/40 text-amber-200 hover:text-white"
              >
                Uygula
              </button>
            </div>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-secondary)]">Son geçiş:</span>
          <button
            type="button"
            disabled={!canSendFeedback}
            onClick={() => onSubmitFeedback('good')}
            className="px-2 py-1 text-[10px] border border-white/10 text-emerald-300 disabled:opacity-50"
          >
            iyi
          </button>
          <button
            type="button"
            disabled={!canSendFeedback}
            onClick={() => onSubmitFeedback('ok')}
            className="px-2 py-1 text-[10px] border border-white/10 text-amber-300 disabled:opacity-50"
          >
            idare eder
          </button>
          <button
            type="button"
            disabled={!canSendFeedback}
            onClick={() => onSubmitFeedback('bad')}
            className="px-2 py-1 text-[10px] border border-white/10 text-rose-300 disabled:opacity-50"
          >
            kotu
          </button>
          {lastFeedbackLabel && (
            <span className="text-[10px] text-[var(--color-text-secondary)]">Kaydedildi: {lastFeedbackLabel}</span>
          )}
        </div>
      </section>

      <section className="bg-[var(--color-surface)] border border-white/10 p-3 flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-2 gap-2">
          <h2 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
            Sıradaki Öneriler
          </h2>
          <span className="text-[10px] text-[var(--color-text-secondary)]">
            {transitionCandidates.length} öneri
          </span>
        </div>

        {!currentTrack ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
            Öneriler için önce bir şarkı çal.
          </div>
        ) : isTransitionLoading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
            Öneriler hazırlanıyor...
          </div>
        ) : transitionError ? (
          <div className="flex-1 flex items-center justify-center text-sm text-amber-400">
            {transitionError}
          </div>
        ) : transitionCandidates.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
            Bu şarkı için uygun öneri bulunamadı.
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
            {transitionCandidates.map((candidate, index) => {
              const targetTrack = libraryTrackMap.get(candidate.targetTrackId);
              return (
                <div
                  key={`${candidate.targetTrackId}:${candidate.targetTimeMs}:${index}`}
                  className="border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-[var(--color-text-primary)] truncate">
                        {targetTrack?.name ?? candidate.targetTrackId}
                      </div>
                      <div className="text-xs text-[var(--color-text-secondary)] truncate">
                        {targetTrack?.artist ?? 'Bilinmeyen sanatçı'}
                      </div>
                      <div className="text-[11px] text-[var(--color-text-secondary)] mt-1 truncate">
                        Neden bu aday? {candidate.explain.topReasons.slice(0, 3).join(' • ') || buildReasonLabel(candidate)}
                      </div>
                      {candidate.explain.gateStatus === 'fail' && candidate.explain.skipReason && (
                        <div className="text-[11px] text-amber-300 mt-1 truncate">
                          Gate notu: {candidate.explain.skipReason}
                        </div>
                      )}
                      <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
                        Smoothness {formatPercent(candidate.score.smoothnessScore)}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="text-xs text-emerald-300">
                        Uyum {formatPercent(candidate.score.finalScore)}
                      </div>
                      <div className="text-[10px] text-sky-300 border border-sky-400/30 px-1 py-0.5">
                        Guven {formatPercent(candidate.confidenceScore)}
                      </div>
                      <button
                        type="button"
                        onClick={() => onNowTransition(candidate)}
                        className="px-2 py-1 text-xs border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        title="Geçiş anına 5 sn kala hazırlar"
                      >
                        Şimdi Geç
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
