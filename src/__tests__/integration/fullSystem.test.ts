import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getYouTubeProvider } from '../../services/providers/youtube';
import { parseMood } from '../../services/mood/engine';
import { createProvider, getAvailableProviders } from '../../services/providers';
import * as youtubePlayer from '../../services/youtube/player';
import * as youtubeSearch from '../../services/youtube/search';
import * as audioAnalyzer from '../../services/audio/analyzer';
import * as ollamaParser from '../../services/mood/ollamaParser';
import * as ollamaService from '../../services/ai/ollama';

// Mock dependencies
vi.mock('../../services/youtube/player', () => ({
  extractVideoId: vi.fn(),
  getYouTubePlayer: vi.fn(),
  destroyYouTubePlayer: vi.fn(),
}));

vi.mock('../../services/youtube/search', () => ({
  getVideoInfo: vi.fn(),
  getPlaylist: vi.fn(() => []),
  addToPlaylist: vi.fn(),
  removeFromPlaylist: vi.fn(),
  addToRecentlyPlayed: vi.fn(),
}));

vi.mock('../../services/audio/analyzer', () => ({
  getCachedAnalysis: vi.fn(),
  generateSyntheticFeatures: vi.fn(),
}));

vi.mock('../../services/mood/ollamaParser', () => ({
  isLLMAvailable: vi.fn(),
  parseMoodWithLLM: vi.fn(),
}));

vi.mock('../../services/ai/ollama', () => ({
  getOllamaStatus: vi.fn(),
  isOllamaRunning: vi.fn(),
  generate: vi.fn(),
  embed: vi.fn(),
}));

// Import providers to ensure they register themselves
import '../../services/providers/spotify';
import '../../services/providers/mock';
import '../../services/providers/youtube';

describe('Integration: Full System Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage for each test
    localStorage.clear();
  });

  describe('YouTube Integration', () => {
    it('should add a track from URL and generate features', async () => {
      const mockUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const mockVideoId = 'dQw4w9WgXcQ';
      const mockInfo = {
        videoId: mockVideoId,
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      };
      const mockFeatures = {
        energy: 0.7,
        valence: 0.9,
        tempo: 113,
        danceability: 0.8,
        acousticness: 0.1,
        instrumentalness: 0,
        key: 1,
        mode: 1,
      };

      // Setup mocks
      vi.mocked(youtubePlayer.extractVideoId).mockReturnValue(mockVideoId);
      vi.mocked(youtubeSearch.getVideoInfo).mockResolvedValue(mockInfo);
      vi.mocked(audioAnalyzer.generateSyntheticFeatures).mockReturnValue(mockFeatures);

      const provider = getYouTubeProvider();
      const track = await provider.addTrackFromUrl(mockUrl);

      // Verify track was created correctly
      expect(track).not.toBeNull();
      expect(track?.id).toBe(mockVideoId);
      expect(track?.name).toBe(mockInfo.title);
      expect(track?.audioFeatures).toEqual(mockFeatures);

      // Verify dependencies were called
      expect(youtubePlayer.extractVideoId).toHaveBeenCalledWith(mockUrl);
      expect(youtubeSearch.getVideoInfo).toHaveBeenCalledWith(mockVideoId);
      expect(youtubeSearch.addToPlaylist).toHaveBeenCalled();
    });
  });

  describe('Mood Engine AI Fallback', () => {
    it('should use LLM when Ollama is running and models are available', async () => {
      const userInput = 'feeling like a rainy day in Paris but with a bit of hope';
      const mockLLMResult = {
        params: {
          energy: 0.3,
          valence: 0.4,
          danceability: 0.2,
          tempo: { min: 60, max: 90 },
          acousticness: 0.8,
        },
      };

      // Setup mocks
      vi.mocked(ollamaService.isOllamaRunning).mockResolvedValue(true);
      vi.mocked(ollamaParser.isLLMAvailable).mockResolvedValue(true);
      vi.mocked(ollamaParser.parseMoodWithLLM).mockResolvedValue(mockLLMResult);

      const result = await parseMood(userInput);

      expect(result.method).toBe('llm');
      expect(result.params).toEqual(mockLLMResult.params);
      expect(ollamaParser.parseMoodWithLLM).toHaveBeenCalledWith(userInput);
    });

    it('should fallback to keyword mapping when Ollama is offline', async () => {
      const userInput = 'happy bouncy music';
      
      vi.mocked(ollamaService.isOllamaRunning).mockResolvedValue(false);
      vi.mocked(ollamaParser.isLLMAvailable).mockResolvedValue(false);

      const result = await parseMood(userInput);

      expect(result.method).toBe('keyword');
      expect(result.params.energy).toBeGreaterThan(0.5); // Happy should be high energy
      expect(ollamaParser.parseMoodWithLLM).not.toHaveBeenCalled();
    });
  });

  describe('Provider Management', () => {
    it('should register and create all available providers', () => {
      const providers = getAvailableProviders();
      expect(providers).toContain('spotify');
      expect(providers).toContain('youtube');
      expect(providers).toContain('mock');

      const youtube = createProvider('youtube');
      expect(youtube.name).toBe('youtube');

      const mock = createProvider('mock');
      expect(mock.name).toBe('mock');
    });
  });
});
