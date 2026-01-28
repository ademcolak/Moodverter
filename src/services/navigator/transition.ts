import { Track, TransitionInfo } from '../../types/track';
import * as spotifyAnalysis from '../spotify/analysis';

// Default transition settings
const DEFAULT_TRANSITION_OVERLAP_MS = 5000; // 5 seconds
const MIN_OUTRO_LENGTH_MS = 10000; // 10 seconds before end at minimum

// Calculate transition info between two tracks
export const calculateTransition = async (
  accessToken: string,
  currentTrack: Track,
  nextTrack: Track
): Promise<TransitionInfo> => {
  try {
    // Get intro/outro points for both tracks
    const [currentPoints, nextPoints] = await Promise.all([
      spotifyAnalysis.findIntroOutroPoints(accessToken, currentTrack.spotifyId),
      spotifyAnalysis.findIntroOutroPoints(accessToken, nextTrack.spotifyId),
    ]);

    // Use cached values if available
    const outroStart = currentTrack.outroStartMs || currentPoints.outroStartMs;
    const introEnd = nextTrack.introEndMs || nextPoints.introEndMs;

    // Ensure we don't transition too late
    const transitionPoint = Math.min(
      outroStart,
      currentTrack.durationMs - MIN_OUTRO_LENGTH_MS
    );

    return {
      fromTrack: currentTrack,
      toTrack: nextTrack,
      transitionPoint,
      seekPoint: introEnd,
    };
  } catch (err) {
    console.error('Failed to calculate transition:', err);
    
    // Fallback: use simple time-based calculation
    return {
      fromTrack: currentTrack,
      toTrack: nextTrack,
      transitionPoint: currentTrack.durationMs - DEFAULT_TRANSITION_OVERLAP_MS * 2,
      seekPoint: 0, // Start from beginning
    };
  }
};

// Schedule transition at the right time
export const scheduleTransition = (
  transition: TransitionInfo,
  currentProgressMs: number,
  onTransition: (transition: TransitionInfo) => void
): ReturnType<typeof setTimeout> | null => {
  const timeUntilTransition = transition.transitionPoint - currentProgressMs;

  if (timeUntilTransition <= 0) {
    // Already past transition point
    return null;
  }

  return setTimeout(() => {
    onTransition(transition);
  }, timeUntilTransition);
};

// Execute the transition (play next track)
export const executeTransition = async (
  _accessToken: string,
  transition: TransitionInfo,
  playTrackFn: (uri: string, seekMs?: number) => Promise<void>
): Promise<void> => {
  const trackUri = `spotify:track:${transition.toTrack.spotifyId}`;
  
  // Play the next track, optionally seeking past intro
  await playTrackFn(trackUri, transition.seekPoint);
};

// Simple transition without audio analysis
export const calculateSimpleTransition = (
  currentTrack: Track,
  nextTrack: Track,
  transitionBeforeEndMs = 10000
): TransitionInfo => {
  return {
    fromTrack: currentTrack,
    toTrack: nextTrack,
    transitionPoint: Math.max(0, currentTrack.durationMs - transitionBeforeEndMs),
    seekPoint: 0,
  };
};

// Check if we should start looking for next track
export const shouldPrepareNextTrack = (
  currentProgressMs: number,
  trackDurationMs: number,
  prepareBeforeMs = 30000
): boolean => {
  return (trackDurationMs - currentProgressMs) <= prepareBeforeMs;
};

// Calculate smooth energy transition path
export const calculateEnergyPath = (
  currentEnergy: number,
  targetEnergy: number,
  numSteps: number
): number[] => {
  const path: number[] = [];
  const diff = targetEnergy - currentEnergy;
  
  for (let i = 0; i < numSteps; i++) {
    // Ease-in-out curve
    const t = i / (numSteps - 1);
    const easedT = t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2;
    
    path.push(currentEnergy + diff * easedT);
  }
  
  return path;
};
