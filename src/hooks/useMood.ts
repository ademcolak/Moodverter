import { useState, useCallback } from 'react';
import { MoodParameters, MoodState, MoodDeviation } from '../types/mood';
import { Track } from '../types/track';
import * as moodParser from '../services/mood/parser';
import * as moodMapper from '../services/mood/mapper';

interface UseMoodReturn {
  moodState: MoodState;
  processMood: (text: string) => Promise<MoodParameters | null>;
  calculateDeviation: (track: Track) => MoodDeviation | null;
  clearMood: () => void;
}

const SIGNIFICANT_DEVIATION_THRESHOLD = 0.3;

export const useMood = (openAiApiKey: string | null): UseMoodReturn => {
  const [moodState, setMoodState] = useState<MoodState>({
    current: null,
    history: {
      inputs: [],
      parameters: [],
    },
    isProcessing: false,
    error: null,
  });

  const processMood = useCallback(async (text: string): Promise<MoodParameters | null> => {
    if (!text.trim()) return null;

    setMoodState(prev => ({
      ...prev,
      isProcessing: true,
      error: null,
    }));

    try {
      let parameters: MoodParameters;

      if (openAiApiKey) {
        // Use OpenAI for mood analysis
        parameters = await moodParser.parseMoodWithAI(text, openAiApiKey);
      } else {
        // Fallback to keyword-based mapping
        parameters = moodMapper.mapMoodFromKeywords(text);
      }

      setMoodState(prev => ({
        ...prev,
        current: parameters,
        history: {
          inputs: [...prev.history.inputs, { text, timestamp: Date.now() }],
          parameters: [...prev.history.parameters, parameters],
        },
        isProcessing: false,
      }));

      return parameters;
    } catch (err) {
      console.error('Mood processing failed:', err);
      
      // Fallback to keyword mapping on error
      const fallbackParams = moodMapper.mapMoodFromKeywords(text);
      
      setMoodState(prev => ({
        ...prev,
        current: fallbackParams,
        history: {
          inputs: [...prev.history.inputs, { text, timestamp: Date.now() }],
          parameters: [...prev.history.parameters, fallbackParams],
        },
        isProcessing: false,
        error: 'AI analysis failed, using fallback',
      }));

      return fallbackParams;
    }
  }, [openAiApiKey]);

  const calculateDeviation = useCallback((track: Track): MoodDeviation | null => {
    if (!moodState.current) return null;

    const trackParams = {
      energy: track.energy,
      valence: track.valence,
      danceability: track.danceability,
      acousticness: track.acousticness,
      tempo: track.tempo,
    };

    const energyDiff = Math.abs(moodState.current.energy - track.energy);
    const valenceDiff = Math.abs(moodState.current.valence - track.valence);
    const danceabilityDiff = Math.abs(moodState.current.danceability - track.danceability);
    const acousticnessDiff = Math.abs(moodState.current.acousticness - track.acousticness);

    // Weighted deviation score
    const deviationScore = (
      energyDiff * 0.35 +
      valenceDiff * 0.35 +
      danceabilityDiff * 0.15 +
      acousticnessDiff * 0.15
    );

    return {
      fromMood: moodState.current,
      toTrack: trackParams,
      deviationScore,
      isSignificant: deviationScore > SIGNIFICANT_DEVIATION_THRESHOLD,
    };
  }, [moodState.current]);

  const clearMood = useCallback(() => {
    setMoodState({
      current: null,
      history: {
        inputs: [],
        parameters: [],
      },
      isProcessing: false,
      error: null,
    });
  }, []);

  return {
    moodState,
    processMood,
    calculateDeviation,
    clearMood,
  };
};
