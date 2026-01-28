import { MoodParameters } from '../../types/mood';
import { Track, CAMELOT_WHEEL, KEY_COMPATIBILITY } from '../../types/track';

// Weights for mood matching
const MOOD_WEIGHTS = {
  energy: 0.35,
  valence: 0.35,
  danceability: 0.15,
  acousticness: 0.15,
};

// Weights for transition scoring
const TRANSITION_WEIGHTS = {
  keyCompatibility: 0.35,
  bpmProximity: 0.35,
  energyFlow: 0.2,
  diversityBonus: 0.1,
};

// Calculate how well a track matches the target mood
export const calculateMoodScore = (track: Track, target: MoodParameters): number => {
  const energyScore = 1 - Math.abs(track.energy - target.energy);
  const valenceScore = 1 - Math.abs(track.valence - target.valence);
  const danceabilityScore = 1 - Math.abs(track.danceability - target.danceability);
  const acousticnessScore = 1 - Math.abs(track.acousticness - target.acousticness);
  
  // Tempo score - check if track tempo is within target range
  let tempoScore = 0;
  if (track.tempo >= target.tempo_min && track.tempo <= target.tempo_max) {
    tempoScore = 1;
  } else if (track.tempo < target.tempo_min) {
    tempoScore = Math.max(0, 1 - (target.tempo_min - track.tempo) / 30);
  } else {
    tempoScore = Math.max(0, 1 - (track.tempo - target.tempo_max) / 30);
  }

  const baseScore = (
    MOOD_WEIGHTS.energy * energyScore +
    MOOD_WEIGHTS.valence * valenceScore +
    MOOD_WEIGHTS.danceability * danceabilityScore +
    MOOD_WEIGHTS.acousticness * acousticnessScore
  );

  // Add tempo as a multiplier
  return baseScore * (0.5 + 0.5 * tempoScore);
};

// Get Camelot key for a track
const getCamelotKey = (track: Track): string | null => {
  const keyMap = CAMELOT_WHEEL[track.key];
  if (!keyMap) return null;
  return keyMap[track.mode] || null;
};

// Calculate key compatibility between two tracks
const calculateKeyCompatibility = (current: Track, next: Track): number => {
  const currentKey = getCamelotKey(current);
  const nextKey = getCamelotKey(next);

  if (!currentKey || !nextKey) return 0.5; // Unknown key

  const compatibleKeys = KEY_COMPATIBILITY[currentKey] || [];
  
  if (nextKey === currentKey) return 1; // Same key
  if (compatibleKeys.includes(nextKey)) return 0.85; // Compatible key
  
  // Calculate distance on Camelot wheel
  const currentNum = parseInt(currentKey.replace(/[AB]/, ''));
  const nextNum = parseInt(nextKey.replace(/[AB]/, ''));
  const distance = Math.min(
    Math.abs(currentNum - nextNum),
    12 - Math.abs(currentNum - nextNum)
  );
  
  return Math.max(0, 1 - distance * 0.15);
};

// Calculate BPM proximity (allowing for halftime/doubletime)
const calculateBpmProximity = (current: Track, next: Track): number => {
  const currentBpm = current.tempo;
  const nextBpm = next.tempo;
  
  // Consider original BPM
  const directDiff = Math.abs(currentBpm - nextBpm);
  
  // Consider halftime (next track at half speed)
  const halftimeDiff = Math.abs(currentBpm - nextBpm * 2);
  
  // Consider doubletime (next track at double speed)
  const doubletimeDiff = Math.abs(currentBpm - nextBpm / 2);
  
  const minDiff = Math.min(directDiff, halftimeDiff, doubletimeDiff);
  
  // Perfect match within 3 BPM
  if (minDiff <= 3) return 1;
  
  // Good match within 10 BPM
  if (minDiff <= 10) return 0.9;
  
  // Acceptable within 20 BPM
  if (minDiff <= 20) return 0.7;
  
  // Degrading score for larger differences
  return Math.max(0, 1 - minDiff / 50);
};

// Calculate energy flow between tracks
const calculateEnergyFlow = (current: Track, next: Track): number => {
  const energyDiff = next.energy - current.energy;
  
  // Slight increase in energy is good (+0.1 to +0.2)
  if (energyDiff >= 0.05 && energyDiff <= 0.25) return 1;
  
  // Maintaining similar energy is acceptable
  if (Math.abs(energyDiff) <= 0.1) return 0.9;
  
  // Small decrease is okay
  if (energyDiff >= -0.2 && energyDiff < 0) return 0.7;
  
  // Large jumps are penalized
  return Math.max(0, 1 - Math.abs(energyDiff));
};

// Calculate how well a track transitions from the current track
export const calculateTransitionScore = (
  current: Track,
  next: Track,
  recentArtists: Set<string> = new Set()
): number => {
  const keyScore = calculateKeyCompatibility(current, next);
  const bpmScore = calculateBpmProximity(current, next);
  const energyScore = calculateEnergyFlow(current, next);
  
  // Diversity bonus - avoid same artist
  const diversityScore = recentArtists.has(next.artist) ? 0 : 1;

  return (
    TRANSITION_WEIGHTS.keyCompatibility * keyScore +
    TRANSITION_WEIGHTS.bpmProximity * bpmScore +
    TRANSITION_WEIGHTS.energyFlow * energyScore +
    TRANSITION_WEIGHTS.diversityBonus * diversityScore
  );
};

// Combined score for mood + transition
export const calculateTotalScore = (
  track: Track,
  moodParams: MoodParameters,
  currentTrack: Track | null,
  recentArtists: Set<string> = new Set(),
  moodWeight = 0.6,
  transitionWeight = 0.4
): number => {
  const moodScore = calculateMoodScore(track, moodParams);
  
  let transitionScore = 1; // Default if no current track
  if (currentTrack) {
    transitionScore = calculateTransitionScore(currentTrack, track, recentArtists);
  }

  return moodWeight * moodScore + transitionWeight * transitionScore;
};
