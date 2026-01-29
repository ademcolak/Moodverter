# Moodverter

A cross-platform desktop widget that provides mood-based music navigation with Spotify integration. Tell it how you feel, and it will intelligently guide your music journey.

## Features

- **Mood-Based Navigation**: Describe your mood in natural language (supports English and Turkish), and Moodverter will find tracks that match
- **Intelligent Track Selection**: Uses audio features (energy, valence, danceability, acousticness, tempo) to score and select tracks
- **DJ-Style Transitions**: Considers key compatibility (Camelot wheel), BPM matching, and energy flow for smooth transitions
- **Library Sync**: Caches your Spotify library locally for fast, offline-capable mood matching
- **Mood Deviation Detection**: Detects when you skip to tracks that don't match your current mood and offers to adapt
- **Minimal Widget UI**: Compact, always-on-top widget that stays out of your way
- **Cross-Platform**: Built with Tauri for macOS and Windows support
- **System Tray**: Minimize to tray, left-click to toggle visibility, right-click for menu
- **Expand/Collapse**: Quick toggle between full widget and mini player modes
- **Demo Mode**: Try without Spotify using `VITE_MOCK_MODE=true`

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4
- **Desktop Framework**: Tauri 2
- **State Management**: React hooks with local state
- **Styling**: Tailwind CSS with CSS variables for theming
- **Testing**: Vitest, React Testing Library
- **Build Tools**: Vite 7, pnpm

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [pnpm](https://pnpm.io/) (v8 or later)
- [Rust](https://www.rust-lang.org/tools/install) (for Tauri)
- A Spotify Premium account

## Spotify App Setup

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create App"
3. Fill in:
   - App name: `Moodverter` (or any name)
   - App description: Your description
   - Redirect URI: `http://localhost:1420/callback`
4. Save and note your **Client ID**
5. Create a `.env` file in the project root:

```env
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
VITE_SPOTIFY_REDIRECT_URI=http://localhost:1420/callback
# Optional: OpenAI API key for enhanced mood parsing
VITE_OPENAI_API_KEY=your_openai_key_here
```

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/moodverter.git
cd moodverter

# Install dependencies
pnpm install

# Start development server
pnpm tauri dev
```

## Development Commands

```bash
# Start Tauri development (hot-reload)
pnpm tauri dev

# Run Vite dev server only (no Tauri)
pnpm dev

# Run tests
pnpm test

# Run tests once
pnpm test:run

# Run tests with coverage
pnpm test:coverage

# Lint code
pnpm lint

# Fix lint issues
pnpm lint:fix

# Format code
pnpm format

# Check formatting
pnpm format:check
```

## Building

```bash
# Build for production
pnpm tauri build
```

Build outputs:
- **macOS**: `src-tauri/target/release/bundle/dmg/Moodverter_x.x.x_aarch64.dmg`
- **Windows**: `src-tauri/target/release/bundle/msi/Moodverter_x.x.x_x64_en-US.msi`

## Architecture

```
src/
├── components/       # React components
│   ├── ErrorBoundary.tsx
│   ├── LibrarySync.tsx
│   ├── MoodDeviationDialog.tsx
│   ├── MoodInput.tsx
│   ├── NextTrack.tsx
│   ├── NowPlaying.tsx
│   ├── PlayerControls.tsx
│   └── Settings.tsx
├── hooks/            # Custom React hooks
│   ├── useMood.ts
│   ├── usePlayback.ts
│   └── useSpotify.ts
├── services/         # Business logic
│   ├── db/           # Local caching
│   ├── mood/         # Mood parsing and mapping
│   ├── navigator/    # Track selection and transitions
│   └── spotify/      # Spotify API integration
├── types/            # TypeScript types
└── __tests__/        # Test files
```

### Key Algorithms

**Mood Matching** (`services/navigator/scorer.ts`):
- Calculates similarity between track audio features and target mood parameters
- Weighted scoring: energy (35%), valence (35%), danceability (15%), acousticness (15%)
- Tempo range checking with graceful degradation

**Transition Scoring**:
- Key compatibility using the Camelot wheel
- BPM proximity with halftime/doubletime support
- Energy flow optimization (prefers gradual increases)
- Artist diversity bonus

**Mood Keyword Mapping** (`services/mood/mapper.ts`):
- Fallback mood parsing when AI is unavailable
- Supports 40+ keywords in English and Turkish
- Compound mood support (e.g., "happy energetic")

## Test Coverage

The project includes 126 unit tests covering:
- `scorer.ts` - Mood and transition scoring algorithms
- `mapper.ts` - Keyword-to-mood parameter mapping
- `transition.ts` - Camelot wheel and transition calculations
- `cache.ts` - Local storage caching logic
- `selector.ts` - Track selection and filtering

Run tests with `pnpm test:run` or see coverage with `pnpm test:coverage`.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Spotify Web API](https://developer.spotify.com/documentation/web-api/) for music data and playback control
- [Tauri](https://tauri.app/) for the cross-platform desktop framework
- [Camelot Wheel](https://mixedinkey.com/camelot-wheel/) for harmonic mixing reference
