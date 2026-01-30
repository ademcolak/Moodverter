// useMood - Mood processing hook with Ollama integration
// Uses the new mood engine with fallback chain: Preset → Embedding → LLM → Keyword

import { useState, useCallback, useEffect } from 'react';
import { MoodParameters, MoodState, MoodDeviation } from '../types/mood';
import { Track } from '../types/track';
import {
  parseMood,
  parseMoodQuick,
  getEngineStatus,
  moodParamsToLegacy,
  type MoodParseResult,
  type EngineStatus,
} from '../services/mood/engine';
import * as moodMapper from '../services/mood/mapper';

interface UseMoodReturn {
  moodState: MoodState;
  processMood: (text: string) => Promise<MoodParameters | null>;
  processMoodQuick: (text: string) => MoodParameters | null;
  setMoodParameters: (params: MoodParameters, method?: string) => void;
  calculateDeviation: (track: Track) => MoodDeviation | null;
  clearMood: () => void;
  // New: Engine status and parse info
  engineStatus: EngineStatus | null;
  lastParseResult: MoodParseResult | null;
  refreshEngineStatus: () => Promise<void>;
}

const SIGNIFICANT_DEVIATION_THRESHOLD = 0.3;

export const useMood = (_apiKey?: string | null): UseMoodReturn => {
  // Note: apiKey parameter is kept for backward compatibility but ignored
  // The new engine uses Ollama instead of OpenAI

  const [moodState, setMoodState] = useState<MoodState>({
    current: null,
    history: {
      inputs: [],
      parameters: [],
    },
    isProcessing: false,
    error: null,
  });

  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [lastParseResult, setLastParseResult] = useState<MoodParseResult | null>(null);

  // Check engine status on mount
  useEffect(() => {
    refreshEngineStatus();
  }, []);

  const refreshEngineStatus = useCallback(async () => {
    try {
      const status = await getEngineStatus();
      setEngineStatus(status);
    } catch (err) {
      console.error('Failed to get engine status:', err);
    }
  }, []);

  // Full mood processing with AI fallback chain
  const processMood = useCallback(async (text: string): Promise<MoodParameters | null> => {
    if (!text.trim()) return null;

    setMoodState(prev => ({
      ...prev,
      isProcessing: true,
      error: null,
    }));

    try {
      // Use the new mood engine
      const result = await parseMood(text);
      const parameters = moodParamsToLegacy(result.params);

      setLastParseResult(result);

      setMoodState(prev => ({
        ...prev,
        current: parameters,
        history: {
          inputs: [...prev.history.inputs, { text, timestamp: Date.now() }],
          parameters: [...prev.history.parameters, parameters],
        },
        isProcessing: false,
        error: result.method === 'default' ? 'Using default parameters' : null,
      }));

      return parameters;
    } catch (err) {
      console.error('Mood processing failed:', err);

      // Fallback to keyword mapping on error
      const fallbackParams = moodMapper.mapMoodFromKeywords(text);

      setLastParseResult({
        params: {
          energy: fallbackParams.energy,
          valence: fallbackParams.valence,
          danceability: fallbackParams.danceability,
          tempo: { min: fallbackParams.tempo_min, max: fallbackParams.tempo_max },
          acousticness: fallbackParams.acousticness,
        },
        method: 'keyword',
        confidence: 0.3,
        processingTimeMs: 0,
      });

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
  }, []);

  // Quick sync processing (no AI, just preset/keyword matching)
  const processMoodQuickFn = useCallback((text: string): MoodParameters | null => {
    if (!text.trim()) return null;

    try {
      const result = parseMoodQuick(text);
      const parameters = moodParamsToLegacy(result.params);

      setLastParseResult(result);

      setMoodState(prev => ({
        ...prev,
        current: parameters,
        history: {
          inputs: [...prev.history.inputs, { text, timestamp: Date.now() }],
          parameters: [...prev.history.parameters, parameters],
        },
        isProcessing: false,
        error: null,
      }));

      return parameters;
    } catch (err) {
      console.error('Quick mood processing failed:', err);
      return null;
    }
  }, []);

  const setMoodParameters = useCallback((parameters: MoodParameters, method: string = 'manual') => {
    setLastParseResult({
      params: {
        energy: parameters.energy,
        valence: parameters.valence,
        danceability: parameters.danceability,
        tempo: { min: parameters.tempo_min, max: parameters.tempo_max },
        acousticness: parameters.acousticness,
      },
      method: method as any,
      confidence: 1.0,
      processingTimeMs: 0,
    });

    setMoodState(prev => ({
      ...prev,
      current: parameters,
      isProcessing: false,
      error: null,
    }));
  }, []);

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
    setLastParseResult(null);
  }, []);

  return {
    moodState,
    processMood,
    processMoodQuick: processMoodQuickFn,
    setMoodParameters,
    calculateDeviation,
    clearMood,
    engineStatus,
    lastParseResult,
    refreshEngineStatus,
  };
};
