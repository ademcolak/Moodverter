import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YouTubeProvider } from '../../../services/providers/youtube';
import * as playerService from '../../../services/youtube/player';
import * as searchService from '../../../services/youtube/search';
import * as analyzerService from '../../../services/audio/analyzer';

// Mock dependencies
vi.mock('../../../services/youtube/player');
vi.mock('../../../services/youtube/search');
vi.mock('../../../services/audio/analyzer');

describe('YouTubeProvider', () => {
  let provider: YouTubeProvider;
  let mockPlayer: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock player
    mockPlayer = {
      initialize: vi.fn().mockResolvedValue(undefined),
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      loadVideo: vi.fn(),
      getState: vi.fn().mockReturnValue({
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 100,
        videoId: null,
      }),
      onStateChange: vi.fn(),
    };

    // @ts-ignore
    vi.spyOn(playerService, 'getYouTubePlayer').mockReturnValue(mockPlayer);
    
    // Mock getCachedAnalysis to return null by default
    vi.spyOn(analyzerService, 'getCachedAnalysis').mockReturnValue(null);
    
    // Mock generateSyntheticFeatures
    vi.spyOn(analyzerService, 'generateSyntheticFeatures').mockReturnValue({
      energy: 0.5,
      valence: 0.5,
      tempo: 120,
      danceability: 0.5,
      acousticness: 0.5,
      instrumentalness: 0.1,
      key: 0,
      mode: 1,
    });

    // Mock search/video info
    vi.spyOn(searchService, 'getVideoInfo').mockResolvedValue({
      videoId: 'test-video-id',
      title: 'Test Video',
      artist: 'Test Artist',
      thumbnail: 'test-thumb.jpg',
      duration: 180,
      addedAt: Date.now(),
    });

    vi.spyOn(searchService, 'getPlaylist').mockReturnValue([]);

    provider = new YouTubeProvider();
  });

  it('should authenticate (initialize) successfully', async () => {
    await provider.authenticate();
    expect(playerService.getYouTubePlayer).toHaveBeenCalled();
    expect(mockPlayer.initialize).toHaveBeenCalled();
  });

  it('should play a track', async () => {
    const trackId = 'test-video-id';
    await provider.play(trackId);

    expect(mockPlayer.loadVideo).toHaveBeenCalledWith(trackId, true);
    expect(searchService.getVideoInfo).toHaveBeenCalledWith(trackId);
  });

  it('should search for tracks', async () => {
    // Mock URL search
    vi.spyOn(playerService, 'extractVideoId').mockReturnValue('test-video-id');
    
    const results = await provider.search('https://youtube.com/watch?v=test-video-id');
    
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-video-id');
    expect(results[0].name).toBe('Test Video');
  });

  it('should get audio features (synthetic)', async () => {
    const features = await provider.getAudioFeatures('test-video-id');
    
    expect(features).toBeDefined();
    expect(features?.energy).toBe(0.5); // Mocked value
    expect(analyzerService.generateSyntheticFeatures).toHaveBeenCalled();
  });

  it('should manage playback state', async () => {
    await provider.authenticate();
    await provider.pause();
    expect(mockPlayer.pause).toHaveBeenCalled();

    await provider.resume();
    expect(mockPlayer.play).toHaveBeenCalled();

    await provider.seek(30000);
    expect(mockPlayer.seek).toHaveBeenCalledWith(30);
  });
});
