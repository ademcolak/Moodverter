// Track related types

export interface Track {
  spotifyId: string;
  name: string;
  artist: string;
  albumArt?: string;
  durationMs: number;
  releaseYear?: number;
  
  // Audio features
  energy: number;
  valence: number;
  tempo: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  key: number;
  mode: number;  // 0 = minor, 1 = major
  
  // Transition points
  introEndMs?: number;
  outroStartMs?: number;
  
  // Metadata
  lastPlayed?: Date;
  playCount: number;
  cachedAt?: Date;
}

export interface TrackScore {
  track: Track;
  moodScore: number;        // How well it matches the mood
  transitionScore: number;  // How well it transitions from current
  totalScore: number;       // Combined score
}

export interface TransitionInfo {
  fromTrack: Track;
  toTrack: Track;
  transitionPoint: number;  // ms from start of current track
  seekPoint: number;        // ms to seek in next track (intro skip)
}

// Camelot wheel for key compatibility
export const CAMELOT_WHEEL: Record<number, Record<number, string>> = {
  // key: { mode: camelotKey }
  0: { 0: '5A', 1: '8B' },   // C
  1: { 0: '12A', 1: '3B' },  // C#/Db
  2: { 0: '7A', 1: '10B' },  // D
  3: { 0: '2A', 1: '5B' },   // D#/Eb
  4: { 0: '9A', 1: '12B' },  // E
  5: { 0: '4A', 1: '7B' },   // F
  6: { 0: '11A', 1: '2B' },  // F#/Gb
  7: { 0: '6A', 1: '9B' },   // G
  8: { 0: '1A', 1: '4B' },   // G#/Ab
  9: { 0: '8A', 1: '11B' },  // A
  10: { 0: '3A', 1: '6B' },  // A#/Bb
  11: { 0: '10A', 1: '1B' }, // B
};

// Key compatibility lookup
export const KEY_COMPATIBILITY: Record<string, string[]> = {
  '1A': ['1A', '1B', '12A', '2A'],
  '1B': ['1B', '1A', '12B', '2B'],
  '2A': ['2A', '2B', '1A', '3A'],
  '2B': ['2B', '2A', '1B', '3B'],
  '3A': ['3A', '3B', '2A', '4A'],
  '3B': ['3B', '3A', '2B', '4B'],
  '4A': ['4A', '4B', '3A', '5A'],
  '4B': ['4B', '4A', '3B', '5B'],
  '5A': ['5A', '5B', '4A', '6A'],
  '5B': ['5B', '5A', '4B', '6B'],
  '6A': ['6A', '6B', '5A', '7A'],
  '6B': ['6B', '6A', '5B', '7B'],
  '7A': ['7A', '7B', '6A', '8A'],
  '7B': ['7B', '7A', '6B', '8B'],
  '8A': ['8A', '8B', '7A', '9A'],
  '8B': ['8B', '8A', '7B', '9B'],
  '9A': ['9A', '9B', '8A', '10A'],
  '9B': ['9B', '9A', '8B', '10B'],
  '10A': ['10A', '10B', '9A', '11A'],
  '10B': ['10B', '10A', '9B', '11B'],
  '11A': ['11A', '11B', '10A', '12A'],
  '11B': ['11B', '11A', '10B', '12B'],
  '12A': ['12A', '12B', '11A', '1A'],
  '12B': ['12B', '12A', '11B', '1B'],
};
