// YouTube-specific types

export interface VideoMetadata {
  videoId: string;
  title: string;
  artist: string;
  songName: string;
  uploader: string;
  channel?: string;
  description?: string;
  genres: string[];
  moods: string[];
  tags: string[];
  duration: number; // in milliseconds
  viewCount?: number;
  thumbnail: string;
  uploadDate?: string;
  parsedAt: number;
}

export interface MetadataParseResult {
  artist: string;
  songName: string;
  genres: string[];
  moods: string[];
  confidence: number;
}

// Genre keywords for detection
export const GENRE_KEYWORDS: Record<string, string[]> = {
  rock: ['rock', 'metal', 'punk', 'grunge', 'alternative'],
  pop: ['pop', 'mainstream', 'top 40', 'dance pop'],
  hiphop: ['hip hop', 'hip-hop', 'rap', 'trap', 'drill', 'boom bap'],
  rnb: ['r&b', 'rnb', 'soul', 'neo soul', 'contemporary r&b'],
  electronic: ['electronic', 'edm', 'techno', 'house', 'trance', 'dubstep', 'drum and bass', 'dnb'],
  jazz: ['jazz', 'swing', 'bebop', 'smooth jazz', 'fusion'],
  classical: ['classical', 'orchestra', 'symphony', 'chamber', 'baroque', 'romantic era'],
  country: ['country', 'western', 'bluegrass', 'americana'],
  folk: ['folk', 'acoustic', 'singer-songwriter', 'indie folk'],
  blues: ['blues', 'delta blues', 'chicago blues'],
  reggae: ['reggae', 'ska', 'dub', 'dancehall'],
  latin: ['latin', 'salsa', 'reggaeton', 'bachata', 'cumbia'],
  kpop: ['k-pop', 'kpop', 'korean pop'],
  jpop: ['j-pop', 'jpop', 'japanese pop', 'anime'],
  lofi: ['lo-fi', 'lofi', 'chillhop', 'study beats'],
  indie: ['indie', 'independent', 'underground'],
};

// Mood keywords for detection
export const MOOD_KEYWORDS: Record<string, string[]> = {
  energetic: ['energetic', 'energy', 'hype', 'pump', 'intense', 'powerful'],
  happy: ['happy', 'joyful', 'uplifting', 'cheerful', 'feel good'],
  sad: ['sad', 'melancholic', 'emotional', 'heartbreak', 'crying'],
  chill: ['chill', 'relax', 'calm', 'peaceful', 'mellow'],
  romantic: ['romantic', 'love', 'sensual', 'intimate'],
  angry: ['angry', 'aggressive', 'rage', 'fury'],
  party: ['party', 'dance', 'club', 'festival', 'celebration'],
  workout: ['workout', 'gym', 'exercise', 'fitness', 'training'],
  focus: ['focus', 'study', 'concentration', 'work', 'productive'],
  sleep: ['sleep', 'bedtime', 'lullaby', 'night', 'relaxing'],
  nostalgic: ['nostalgic', 'throwback', 'retro', 'vintage', 'memories'],
  epic: ['epic', 'cinematic', 'dramatic', 'orchestral', 'trailer'],
};
