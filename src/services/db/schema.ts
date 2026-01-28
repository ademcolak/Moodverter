// Database schema definitions
// In Tauri, we'll use SQLite through Tauri's SQL plugin
// For now, this is a placeholder with the schema structure

export const SCHEMA_VERSION = 1;

export const CREATE_TRACKS_TABLE = `
CREATE TABLE IF NOT EXISTS tracks (
  spotify_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  artist TEXT NOT NULL,
  album_art TEXT,
  duration_ms INTEGER NOT NULL,
  release_year INTEGER,
  energy REAL,
  valence REAL,
  tempo REAL,
  danceability REAL,
  acousticness REAL,
  instrumentalness REAL,
  key INTEGER,
  mode INTEGER,
  intro_end_ms INTEGER,
  outro_start_ms INTEGER,
  last_played DATETIME,
  play_count INTEGER DEFAULT 0,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

export const CREATE_PLAY_HISTORY_TABLE = `
CREATE TABLE IF NOT EXISTS play_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id TEXT NOT NULL,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  mood_params TEXT,
  skipped INTEGER DEFAULT 0,
  skip_position_ms INTEGER,
  FOREIGN KEY (track_id) REFERENCES tracks(spotify_id)
);
`;

export const CREATE_MOOD_HISTORY_TABLE = `
CREATE TABLE IF NOT EXISTS mood_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mood_text TEXT NOT NULL,
  energy REAL,
  valence REAL,
  danceability REAL,
  acousticness REAL,
  tempo_min INTEGER,
  tempo_max INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

export const CREATE_SETTINGS_TABLE = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_tracks_energy ON tracks(energy);
CREATE INDEX IF NOT EXISTS idx_tracks_valence ON tracks(valence);
CREATE INDEX IF NOT EXISTS idx_tracks_tempo ON tracks(tempo);
CREATE INDEX IF NOT EXISTS idx_tracks_cached_at ON tracks(cached_at);
CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id);
CREATE INDEX IF NOT EXISTS idx_play_history_time ON play_history(played_at);
`;

// Schema initialization
export const initializeSchema = async (_db: unknown): Promise<void> => {
  // This will be implemented when Tauri SQLite is integrated
  // For now, use localStorage as a fallback
  // eslint-disable-next-line no-console
  console.log('Database schema ready (using localStorage fallback)');
};
