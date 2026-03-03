import type { BaselineRunArtifact, TransitionRuntimeEvent } from '../../services/transition';

export interface TransitionFeedbackEntry {
  eventKey: string;
  rating: 'good' | 'ok' | 'bad';
  recordedAt: string;
}

export interface HistoryPageProps {
  title?: string;
  baselineHistory: BaselineRunArtifact[];
  runtimeEvents: TransitionRuntimeEvent[];
  feedbackEvents: TransitionFeedbackEntry[];
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function scoreRuntimeQuality(event: TransitionRuntimeEvent): number {
  const latencyScore = 1 - Math.min(1, event.latencyMs / 3000);
  const stallPenalty = event.stalled ? 0.3 : 0;
  const dropPenalty = event.dropped ? 0.35 : 0;
  const skipPenalty = event.skippedAutoTransition ? 0.2 : 0;
  return Math.max(0, Math.min(1, latencyScore - stallPenalty - dropPenalty - skipPenalty));
}

export function HistoryPage({
  title = 'History',
  baselineHistory,
  runtimeEvents,
  feedbackEvents,
}: HistoryPageProps) {
  const recentRuntime = runtimeEvents.slice(0, 20);
  const skipReasonCounts = recentRuntime.reduce<Map<string, number>>((counts, event) => {
    if (!event.skippedAutoTransition) return counts;
    (event.skipReasons ?? []).forEach((reason) => {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    });
    return counts;
  }, new Map());
  const topSkipReasons = [...skipReasonCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);
  const qualityScores = recentRuntime.map((event) => scoreRuntimeQuality(event));
  const averageQuality = qualityScores.length === 0
    ? null
    : qualityScores.reduce((sum, value) => sum + value, 0) / qualityScores.length;
  const recentFeedback = feedbackEvents.slice(0, 20);
  const feedbackScore = recentFeedback.length === 0
    ? null
    : recentFeedback.reduce((sum, item) => sum + (item.rating === 'good' ? 1 : item.rating === 'ok' ? 0.6 : 0.2), 0) / recentFeedback.length;
  const latestBaseline = baselineHistory[0] ?? null;
  const feedbackBySourceTrack = recentFeedback.reduce<Map<string, number[]>>((scoresByTrack, item) => {
    const eventKeyParts = item.eventKey.split(':');
    const sourceTrackId = eventKeyParts.length >= 3 ? eventKeyParts[1] : '';
    if (!sourceTrackId) return scoresByTrack;
    const score = item.rating === 'good' ? 1 : item.rating === 'ok' ? 0.6 : 0.2;
    const current = scoresByTrack.get(sourceTrackId) ?? [];
    scoresByTrack.set(sourceTrackId, [...current, score]);
    return scoresByTrack;
  }, new Map());
  const feedbackTuningMap = [...feedbackBySourceTrack.entries()]
    .map(([trackId, scores]) => {
      const feedbackMean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
      const tuningConfidence = latestBaseline?.tuningActions.find((action) => action.trackId === trackId)?.confidence ?? 0;
      const combinedSignal = Math.max(0, Math.min(1, feedbackMean * 0.6 + tuningConfidence * 0.4));
      return {
        trackId,
        feedbackMean,
        tuningConfidence,
        combinedSignal,
      };
    })
    .sort((a, b) => b.combinedSignal - a.combinedSignal)
    .slice(0, 5);

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col gap-4">
      <section className="bg-[var(--color-surface)] border border-white/10 p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Geçiş geçmişi, skip reason trendi ve kalite sinyalleri.
        </p>
      </section>

      <section className="bg-[var(--color-surface)] border border-white/10 p-4">
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
          Skip Reason Trend (Son 20)
        </div>
        <div className="mt-2 text-sm text-[var(--color-text-primary)]">
          {topSkipReasons.length === 0
            ? 'Skip reason kaydi yok.'
            : topSkipReasons.map(([reason, count]) => `${reason} (${count})`).join(' | ')}
        </div>
      </section>

      <section className="bg-[var(--color-surface)] border border-white/10 p-4">
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
          Son 20 Gecis Kalite Trendi
        </div>
        <div className="mt-2 text-sm text-[var(--color-text-primary)]">
          Runtime kalite: {averageQuality === null ? 'N/A' : formatPercent(averageQuality)}
          {' | '} Feedback kalite: {feedbackScore === null ? 'N/A' : formatPercent(feedbackScore)}
          {' | '} Baseline koşu: {baselineHistory.length}
        </div>
      </section>

      <section className="bg-[var(--color-surface)] border border-white/10 p-4">
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
          Feedback + Tuning Signal Map
        </div>
        <div className="mt-2 text-sm text-[var(--color-text-primary)]">
          {feedbackTuningMap.length === 0
            ? 'Birlesik sinyal icin yeterli feedback yok.'
            : feedbackTuningMap
                .map((entry) => `${entry.trackId} ${formatPercent(entry.combinedSignal)} (fb ${formatPercent(entry.feedbackMean)} | tune ${formatPercent(entry.tuningConfidence)})`)
                .join(' | ')}
        </div>
      </section>

      <section className="bg-[var(--color-surface)] border border-white/10 p-4 flex-1 min-h-0 overflow-y-auto">
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
          Son Runtime Eventler
        </div>
        {recentRuntime.length === 0 ? (
          <div className="text-sm text-[var(--color-text-secondary)]">Henüz kayıt yok.</div>
        ) : (
          <div className="space-y-1">
            {recentRuntime.map((event, index) => (
              <div key={`${event.recordedAt}:${index}`} className="text-[11px] text-[var(--color-text-secondary)]">
                {event.sourceTrackId} → {event.targetTrackId}
                {' | '} latency {Math.round(event.latencyMs)}ms
                {' | '} skip {event.skippedAutoTransition ? 'yes' : 'no'}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
