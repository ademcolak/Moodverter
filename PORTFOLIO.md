# Moodverter - Portfolio

## Project Overview

**Moodverter** is a cross-platform desktop widget that transforms the way you interact with your music library. Instead of manually browsing playlists or relying on algorithmic recommendations, Moodverter lets you describe how you feel in natural language and intelligently navigates your Spotify library to match your mood.

**Type**: Desktop Application (Widget)
**Duration**: Personal Project
**Role**: Full-Stack Developer

## Problem Statement

Music streaming services offer recommendation algorithms, but they lack real-time mood awareness. Users often spend time searching for the right song instead of enjoying music. Moodverter bridges this gap by providing a mood-first approach to music navigation.

## Key Features

- **Natural Language Mood Input**: Describe your mood in English or Turkish ("I'm feeling energetic", "sakin bir sey cal")
- **Intelligent Scoring Engine**: Multi-factor track scoring using energy, valence, danceability, acousticness, and tempo
- **DJ-Quality Transitions**: Camelot wheel-based key compatibility, BPM matching, and energy flow analysis
- **Mood Deviation Detection**: Detects when user behavior diverges from the set mood and offers adaptation
- **Local Library Caching**: Full library sync with localStorage for offline-capable mood matching
- **Minimal Always-On Widget**: Compact UI with collapsible state for non-intrusive use

## Technical Highlights

### Audio Feature Analysis
Built a scoring system that evaluates tracks on multiple dimensions simultaneously:
- **Mood Score**: Weighted comparison (energy 35%, valence 35%, danceability 15%, acousticness 15%)
- **Transition Score**: Key compatibility (Camelot wheel), BPM proximity with halftime/doubletime support, energy flow
- **Combined Score**: Configurable mood-to-transition weight ratio (default 60/40)

### Camelot Wheel Implementation
Implemented the complete Camelot wheel system for harmonic mixing:
- Full 12-key x 2-mode mapping (24 Camelot positions)
- Neighbor key compatibility lookup table
- Distance-based scoring for non-adjacent keys

### Mood Parsing Pipeline
Dual-mode mood interpretation:
1. **AI Mode**: OpenAI API integration for nuanced natural language understanding
2. **Keyword Fallback**: 40+ keyword mappings (English + Turkish) with compound mood support and averaging

### State Management Architecture
- Custom React hooks (`useMood`, `usePlayback`, `useSpotify`) for clean separation of concerns
- Spotify PKCE OAuth flow with automatic token refresh
- Library caching with 24-hour staleness detection

## Technical Challenges

### 1. Smooth Track Transitions
Calculating optimal transition points between tracks required analyzing audio features and finding segments where tracks could blend naturally. Solved using intro/outro point detection from Spotify's Audio Analysis API, with simple time-based fallbacks.

### 2. Mood Deviation Detection
Detecting when a user's manual actions (skip, manual selection) deviate from the set mood was non-trivial. Implemented a weighted deviation score that triggers adaptation dialogs only for significant deviations, while silently adapting for small ones.

### 3. Library Scale Performance
Scoring the entire user library against mood parameters needed optimization. Used localStorage caching to avoid repeated API calls, and pre-computed audio features during library sync.

### 4. Cross-Platform Desktop Widget
Building a minimal, always-on-top widget that feels native on both macOS and Windows required careful Tauri configuration and platform-specific considerations for window management.

## Tech Stack

| Category | Technology |
|----------|------------|
| Frontend | React 19, TypeScript |
| Styling | Tailwind CSS 4 (CSS variables theming) |
| Desktop | Tauri 2 (Rust backend) |
| Build | Vite 7, pnpm |
| Testing | Vitest, React Testing Library |
| APIs | Spotify Web API, OpenAI API |
| Auth | OAuth 2.0 PKCE |
| CI/CD | GitHub Actions |

## Lessons Learned

1. **Audio feature-based matching** works surprisingly well for mood-based selection. The weighted scoring approach provides intuitive results without complex ML models.

2. **The Camelot wheel** is a powerful tool for automated DJ-style transitions. Even basic key compatibility checking significantly improves playlist flow.

3. **Fallback strategies** are essential. The keyword-based mood mapping provides a solid experience even without AI API access, covering 90%+ of common mood descriptions.

4. **Tauri 2** provides excellent performance for desktop widgets with significantly smaller bundles compared to Electron, though the ecosystem is still maturing.

5. **Progressive complexity** in mood interpretation (keywords -> AI parsing -> deviation detection -> mood adaptation) creates a layered system where each level enhances the previous one.

## Screenshots

<!-- Add screenshots here -->
<!-- ![Main Widget](screenshots/main.png) -->
<!-- ![Mood Input](screenshots/mood-input.png) -->
<!-- ![Settings](screenshots/settings.png) -->

## Links

- **Repository**: [GitHub](https://github.com/yourusername/moodverter)
- **Technologies**: [Tauri](https://tauri.app/) | [Spotify API](https://developer.spotify.com/) | [React](https://react.dev/)
