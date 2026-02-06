import { describe, it, expect, beforeEach } from 'vitest';
import { MockProvider } from '../../services/providers/mock';
import { parseMoodQuick, moodParamsToLegacy } from '../../services/mood/engine';
import { calculateMoodScore } from '../../services/navigator/scorer';
import { unifiedToLegacyTrack } from '../../services/providers';

describe('Integration: Mock Provider & Mood Engine', () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider();
  });

  it('should flow from mood to track selection', async () => {
    // 1. User inputs mood
    const userInput = 'energetic happy';
    
    // 2. Engine parses mood (using quick parse for deterministic result without Ollama)
    const parseResult = parseMoodQuick(userInput);
    
    expect(parseResult.params).toBeDefined();
    // Convert new params to legacy format for scorer
    const moodParams = moodParamsToLegacy(parseResult.params);
    
    // 3. Provider gets library
    const library = await provider.getLibrary();
    expect(library.length).toBeGreaterThan(0);
    
    // 4. Score tracks against mood
    const scoredTracks = library.map(track => {
        const score = calculateMoodScore(unifiedToLegacyTrack(track), moodParams);
        return { track, score };
    });
    
    // Sort by score
    scoredTracks.sort((a, b) => b.score - a.score);
    
    // 5. Verify best match
    const bestMatch = scoredTracks[0];
    expect(bestMatch.score).toBeGreaterThan(0.5); // Should find a decent match
    
    expect(bestMatch.track.name).toBeTruthy();
  });

  it('should switch tracks in Mock Provider', async () => {
    await provider.authenticate();
    const library = await provider.getLibrary();
    const track1 = library[0];
    const track2 = library[1];

    await provider.play(track1.id);
    let state = await provider.getPlaybackState();
    expect(state?.currentTrack?.id).toBe(track1.id);

    await provider.play(track2.id);
    state = await provider.getPlaybackState();
    expect(state?.currentTrack?.id).toBe(track2.id);
  });
});
