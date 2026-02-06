// Discovery Service - Integrates library selection with YouTube search

import type { UnifiedTrack } from '../../types/provider';
import type { MoodParameters } from '../../types/mood';
import type { DiscoverySettings } from '../../types/discovery';
import { searchVideos, searchResultToUnifiedTrack, type YouTubeSearchResult } from '../youtube/search';
import { selectNextTrack } from '../navigator/selector';
import { unifiedToLegacyTrack, legacyTrackToUnified } from '../providers';

const DISCOVERY_COOLDOWN_MS = 15 * 60 * 1000;
const recentlySelectedVideos = new Map<string, number>();

export interface DiscoveryContext {
  blockedTrackIds?: string[];
  recentYouTubeTrackIds?: string[];
  recentArtists?: string[];
}

export interface DiscoveryCandidateScore {
  videoId: string;
  score: number;
  signals: {
    moodDistance: number;
    keyword: number;
    artistDiversity: number;
    durationSuitability: number;
    quality: number;
    repeatPenalty: number;
    cooldownPenalty: number;
  };
}

export interface DiscoveryDecisionTrace {
  query: string;
  filteredOut: Array<{ videoId: string; reason: string }>;
  candidates: DiscoveryCandidateScore[];
  selectedVideoId?: string;
}

export interface DiscoveryResult {
  source: 'library' | 'youtube';
  track: UnifiedTrack;
  reason: string;
  score: number;
  decisionTrace: DiscoveryDecisionTrace;
}

export async function discoverNextTrack(
  library: UnifiedTrack[],
  moodParams: MoodParameters,
  currentTrack: UnifiedTrack | null,
  settings: DiscoverySettings,
  context: DiscoveryContext = {}
): Promise<DiscoveryResult | null> {
  const libraryResult = selectFromLibrary(library, moodParams, currentTrack);
  const hasEnoughLibrary = library.length >= settings.minLibraryThreshold;

  if (libraryResult && (hasEnoughLibrary || settings.mode === 'library_only')) {
    return {
      source: 'library',
      track: libraryResult,
      reason: 'Kutuphanenden',
      score: 1,
      decisionTrace: {
        query: 'library-selection',
        filteredOut: [],
        candidates: [],
      },
    };
  }

  if (settings.mode === 'library_only') {
    return libraryResult
      ? {
        source: 'library',
        track: libraryResult,
        reason: 'Kutuphanenden',
        score: 0.9,
        decisionTrace: {
          query: 'library-only-mode',
          filteredOut: [],
          candidates: [],
        },
      }
      : null;
  }

  const query = buildMoodSearchQuery(moodParams, currentTrack, settings);
  const youtubeResults = await searchVideos(query, Math.max(10, settings.maxSuggestionsPerCycle * 2));

  const filtered = filterDiscoveryCandidates(youtubeResults, library, context);

  if (filtered.items.length === 0) {
    if (!libraryResult) return null;

    return {
      source: 'library',
      track: libraryResult,
      reason: 'Kutuphanenden (kesif sonuc vermedi)',
      score: 0.7,
      decisionTrace: {
        query,
        filteredOut: filtered.filteredOut,
        candidates: [],
      },
    };
  }

  const scored = scoreCandidates(filtered.items, moodParams, settings, currentTrack, context);
  const best = scored[0];

  if (!best) {
    return libraryResult
      ? {
        source: 'library',
        track: libraryResult,
        reason: 'Kutuphanenden (kesif fallback)',
        score: 0.65,
        decisionTrace: {
          query,
          filteredOut: filtered.filteredOut,
          candidates: scored,
        },
      }
      : null;
  }

  rememberSelectedVideo(best.videoId);

  return {
    source: 'youtube',
    track: searchResultToUnifiedTrack(best.result),
    reason: 'YouTube kesif',
    score: best.score,
    decisionTrace: {
      query,
      filteredOut: filtered.filteredOut,
      candidates: scored.map(toCandidateScore),
      selectedVideoId: best.videoId,
    },
  };
}

export async function discoverSuggestions(
  library: UnifiedTrack[],
  moodParams: MoodParameters,
  currentTrack: UnifiedTrack | null,
  settings: DiscoverySettings,
  limit?: number,
  context: DiscoveryContext = {}
): Promise<UnifiedTrack[]> {
  if (settings.mode === 'library_only') return [];

  const suggestionLimit = Math.max(1, Math.min(limit ?? settings.maxSuggestionsPerCycle, settings.maxSuggestionsPerCycle));
  const query = buildMoodSearchQuery(moodParams, currentTrack, settings);
  const results = await searchVideos(query, Math.max(10, suggestionLimit * 2));
  const filtered = filterDiscoveryCandidates(results, library, context);

  const scored = scoreCandidates(filtered.items, moodParams, settings, currentTrack, context)
    .slice(0, suggestionLimit);

  return scored.map((item) => searchResultToUnifiedTrack(item.result));
}

interface ScoredCandidate {
  result: YouTubeSearchResult;
  videoId: string;
  score: number;
  signals: DiscoveryCandidateScore['signals'];
}

function scoreCandidates(
  results: YouTubeSearchResult[],
  mood: MoodParameters,
  settings: DiscoverySettings,
  currentTrack: UnifiedTrack | null,
  context: DiscoveryContext
): ScoredCandidate[] {
  const keywords = getMoodKeywords(mood);
  const currentArtist = currentTrack?.artist.toLowerCase();
  const currentGenres = getTrackGenres(currentTrack);
  const recentArtists = new Set((context.recentArtists ?? []).map((artist) => artist.toLowerCase()));
  const recentVideos = new Set(context.recentYouTubeTrackIds ?? []);

  const scored = results.map((result): ScoredCandidate => {
    const text = `${result.title} ${result.artist}`.toLowerCase();
    const moodDistance = scoreMoodDistance(text, mood);

    const keywordHits = keywords.filter((keyword) => text.includes(keyword)).length;
    const keywordScore = keywords.length > 0 ? (keywordHits / keywords.length) * 0.25 : 0;

    let artistDiversityScore = 0;
    if (currentArtist) {
      const hasSameArtist = text.includes(currentArtist);
      if (hasSameArtist) {
        artistDiversityScore += settings.preferSimilarArtists ? 0.08 : -0.12;
      } else {
        artistDiversityScore += settings.preferSimilarArtists ? -0.02 : 0.08;
      }
    }

    const resultArtist = result.artist.toLowerCase();
    if (recentArtists.has(resultArtist)) {
      artistDiversityScore -= 0.08;
    }

    if (currentGenres.some((genre) => text.includes(genre))) {
      artistDiversityScore += 0.06;
    }

    const durationMs = result.duration ?? 0;
    const durationSuitability = durationMs === 0
      ? 0
      : (durationMs >= 90_000 && durationMs <= 480_000 ? 0.08 : -0.04);

    const quality = Math.min(0.1, Math.log10((result.viewCount ?? 1) + 1) / 8);

    const repeatPenalty = recentVideos.has(result.videoId) ? -0.35 : 0;
    const cooldownPenalty = isInSelectionCooldown(result.videoId) ? -0.5 : 0;

    const score = 0.28 +
      moodDistance +
      keywordScore +
      artistDiversityScore +
      durationSuitability +
      quality +
      repeatPenalty +
      cooldownPenalty;

    return {
      result,
      videoId: result.videoId,
      score,
      signals: {
        moodDistance,
        keyword: keywordScore,
        artistDiversity: artistDiversityScore,
        durationSuitability,
        quality,
        repeatPenalty,
        cooldownPenalty,
      },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function scoreMoodDistance(text: string, mood: MoodParameters): number {
  const inferred = inferMoodFromText(text);

  const diff =
    Math.abs(inferred.energy - mood.energy) * 0.35 +
    Math.abs(inferred.valence - mood.valence) * 0.35 +
    Math.abs(inferred.danceability - mood.danceability) * 0.15 +
    Math.abs(inferred.acousticness - mood.acousticness) * 0.15;

  return Math.max(0, 0.2 - diff * 0.3);
}

function inferMoodFromText(text: string): {
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
} {
  const energetic = /(energetic|upbeat|dance|workout|party|club|edm|rock|remix)/.test(text);
  const calm = /(calm|relax|ambient|piano|sleep|lofi|chill)/.test(text);
  const happy = /(happy|positive|feel good|joy|sunshine)/.test(text);
  const sad = /(sad|melancholic|emotional|heartbreak|lonely)/.test(text);
  const acoustic = /(acoustic|unplugged|folk)/.test(text);

  return {
    energy: energetic ? 0.82 : calm ? 0.28 : 0.55,
    valence: happy ? 0.8 : sad ? 0.25 : 0.5,
    danceability: energetic ? 0.75 : calm ? 0.35 : 0.55,
    acousticness: acoustic ? 0.8 : energetic ? 0.2 : 0.45,
  };
}

export function selectBestYouTubeMatch(
  results: YouTubeSearchResult[],
  mood: MoodParameters,
  settings: DiscoverySettings,
  currentTrack: UnifiedTrack | null,
  context: DiscoveryContext = {}
): YouTubeSearchResult {
  const scored = scoreCandidates(results, mood, settings, currentTrack, context);
  return (scored[0] ?? { result: results[0] }).result;
}

function toCandidateScore(candidate: ScoredCandidate): DiscoveryCandidateScore {
  return {
    videoId: candidate.videoId,
    score: candidate.score,
    signals: candidate.signals,
  };
}

function filterDiscoveryCandidates(
  results: YouTubeSearchResult[],
  library: UnifiedTrack[],
  context: DiscoveryContext
): { items: YouTubeSearchResult[]; filteredOut: Array<{ videoId: string; reason: string }> } {
  const filteredOut: Array<{ videoId: string; reason: string }> = [];
  const libraryIds = new Set(library.map((track) => track.id));
  const blocked = new Set(context.blockedTrackIds ?? []);

  const items = results.filter((result) => {
    if (libraryIds.has(result.videoId)) {
      filteredOut.push({ videoId: result.videoId, reason: 'already_in_library' });
      return false;
    }

    if (blocked.has(result.videoId)) {
      filteredOut.push({ videoId: result.videoId, reason: 'blocked' });
      return false;
    }

    return true;
  });

  return { items, filteredOut };
}

function selectFromLibrary(
  library: UnifiedTrack[],
  moodParams: MoodParameters,
  currentTrack: UnifiedTrack | null
): UnifiedTrack | null {
  if (library.length === 0) return null;

  const legacyLibrary = library.map(unifiedToLegacyTrack);
  const legacyCurrent = currentTrack ? unifiedToLegacyTrack(currentTrack) : null;

  const selection = selectNextTrack(legacyLibrary, {
    moodParams,
    currentTrack: legacyCurrent,
    recentTracks: [],
    includeRecommendations: true,
  });

  if (!selection) return null;

  const matched = library.find((track) => track.id === selection.track.spotifyId);
  if (matched) return matched;

  const fallbackProvider = currentTrack?.provider || library[0]?.provider || 'spotify';
  return legacyTrackToUnified(selection.track, fallbackProvider);
}

export function buildMoodSearchQuery(
  mood: MoodParameters,
  current: UnifiedTrack | null,
  settings: DiscoverySettings
): string {
  const parts: string[] = [];

  if (mood.energy > 0.7) parts.push('energetic', 'upbeat');
  else if (mood.energy < 0.3) parts.push('calm', 'relaxing');

  if (mood.valence > 0.7) parts.push('happy', 'positive');
  else if (mood.valence < 0.3) parts.push('melancholic', 'emotional');

  if (mood.danceability > 0.7) parts.push('dance', 'groovy');
  if (mood.acousticness > 0.7) parts.push('acoustic');

  const providerGenres = getTrackGenres(current);
  if (providerGenres.length > 0) {
    parts.push(providerGenres[0]);
  }

  if (settings.preferSimilarArtists && current?.artist) {
    parts.push(current.artist);
  }

  parts.push('music', 'official audio');

  return parts.join(' ');
}

function getMoodKeywords(mood: MoodParameters): string[] {
  const keywords: string[] = [];

  if (mood.energy > 0.7) keywords.push('energetic', 'upbeat', 'workout');
  else if (mood.energy < 0.3) keywords.push('calm', 'relaxing', 'ambient');

  if (mood.valence > 0.7) keywords.push('happy', 'positive', 'feel good');
  else if (mood.valence < 0.3) keywords.push('sad', 'melancholic', 'emotional');

  if (mood.danceability > 0.7) keywords.push('dance', 'groovy');
  if (mood.acousticness > 0.7) keywords.push('acoustic');

  return Array.from(new Set(keywords));
}

function getTrackGenres(track: UnifiedTrack | null): string[] {
  if (!track?.providerData) return [];
  const raw = (track.providerData as { genres?: string[] }).genres;
  return Array.isArray(raw) ? raw.map((genre) => genre.toLowerCase()) : [];
}

function isInSelectionCooldown(videoId: string): boolean {
  const previous = recentlySelectedVideos.get(videoId);
  if (!previous) return false;
  return Date.now() - previous < DISCOVERY_COOLDOWN_MS;
}

function rememberSelectedVideo(videoId: string): void {
  const now = Date.now();
  recentlySelectedVideos.set(videoId, now);

  if (recentlySelectedVideos.size > 200) {
    for (const [id, timestamp] of recentlySelectedVideos) {
      if (now - timestamp > DISCOVERY_COOLDOWN_MS * 2) {
        recentlySelectedVideos.delete(id);
      }
    }
  }
}
