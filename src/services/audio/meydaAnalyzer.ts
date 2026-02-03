// Meyda Audio Analyzer - Enhanced audio feature extraction
// Provides more accurate BPM detection, spectral features, and chroma analysis

import Meyda from 'meyda';
import type { AudioFeatures } from '../../types/provider';

export interface MeydaAnalysisResult extends AudioFeatures {
  analysisMethod: 'meyda' | 'webaudio' | 'synthetic';
  confidence: number;
  // Meyda-specific features
  spectralFlatness: number;
  spectralRolloff: number;
  loudness: number;
  perceptualSpread: number;
  chroma: number[];
}

export interface OnsetData {
  times: number[];
  strengths: number[];
}

// Default Meyda features to extract
const MEYDA_FEATURES: string[] = [
  'rms',
  'energy',
  'spectralCentroid',
  'spectralRolloff',
  'spectralFlatness',
  'zcr',
  'loudness',
  'perceptualSpread',
  'chroma',
];

type MeydaFeatures = {
  rms: number;
  energy: number;
  spectralCentroid: number;
  spectralRolloff: number;
  spectralFlatness: number;
  zcr: number;
  loudness: { specific: Float32Array; total: number };
  perceptualSpread: number;
  chroma: number[];
};

/**
 * Analyze audio buffer using Meyda
 */
export async function analyzeAudioBuffer(
  audioBuffer: AudioBuffer,
  sampleRate?: number
): Promise<MeydaAnalysisResult> {
  const rate = sampleRate || audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0); // Use first channel

  // Configure Meyda
  const bufferSize = 2048;
  const hopSize = 1024;
  const numFrames = Math.floor((channelData.length - bufferSize) / hopSize);

  if (numFrames < 10) {
    console.warn('Audio too short for Meyda analysis');
    return getDefaultMeydaResult();
  }

  // Collect features for all frames
  const frameFeatures: MeydaFeatures[] = [];

  for (let i = 0; i < numFrames; i++) {
    const startSample = i * hopSize;
    const frame = channelData.slice(startSample, startSample + bufferSize);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const features = Meyda.extract(MEYDA_FEATURES as any, frame) as MeydaFeatures;
      if (features) {
        frameFeatures.push(features);
      }
    } catch (error) {
      // Skip frames with errors
      continue;
    }
  }

  if (frameFeatures.length === 0) {
    return getDefaultMeydaResult();
  }

  // Aggregate features
  return aggregateFeatures(frameFeatures, channelData, rate);
}

/**
 * Analyze from AudioContext (real-time)
 */
export function createMeydaAnalyzer(
  audioContext: AudioContext,
  source: AudioNode,
  onFeatures: (features: Partial<MeydaFeatures>) => void
): { start: () => void; stop: () => void } {
  let analyzer: ReturnType<typeof Meyda.createMeydaAnalyzer> | null = null;

  const start = () => {
    analyzer = Meyda.createMeydaAnalyzer({
      audioContext,
      source,
      bufferSize: 2048,
      featureExtractors: MEYDA_FEATURES as unknown as string[],
      callback: onFeatures,
    });
    analyzer.start();
  };

  const stop = () => {
    if (analyzer) {
      analyzer.stop();
      analyzer = null;
    }
  };

  return { start, stop };
}

/**
 * Aggregate frame features into final analysis
 */
function aggregateFeatures(
  frames: MeydaFeatures[],
  channelData: Float32Array,
  sampleRate: number
): MeydaAnalysisResult {
  const n = frames.length;

  // Average simple features
  const avgRms = frames.reduce((sum, f) => sum + f.rms, 0) / n;
  const avgEnergy = frames.reduce((sum, f) => sum + f.energy, 0) / n;
  const avgCentroid = frames.reduce((sum, f) => sum + f.spectralCentroid, 0) / n;
  const avgRolloff = frames.reduce((sum, f) => sum + f.spectralRolloff, 0) / n;
  const avgFlatness = frames.reduce((sum, f) => sum + f.spectralFlatness, 0) / n;
  const avgZcr = frames.reduce((sum, f) => sum + f.zcr, 0) / n;
  const avgLoudness = frames.reduce((sum, f) => sum + f.loudness.total, 0) / n;
  const avgSpread = frames.reduce((sum, f) => sum + f.perceptualSpread, 0) / n;

  // Average chroma
  const chromaSum = new Array(12).fill(0);
  frames.forEach(f => {
    f.chroma.forEach((val, i) => {
      chromaSum[i] += val;
    });
  });
  const avgChroma = chromaSum.map(v => v / n);

  // Detect key from chroma
  const { key, mode } = detectKeyFromChroma(avgChroma);

  // Estimate tempo using onset detection
  const tempo = estimateTempoFromOnsets(channelData, sampleRate);

  // Map features to AudioFeatures
  // Energy: based on RMS and energy
  const energy = Math.min(1, avgRms * 3 + avgEnergy * 0.5);

  // Valence: use spectral features as proxy
  // Higher centroid and brightness = more positive
  const brightness = avgCentroid / 8000; // Normalize
  const valence = Math.min(1, (brightness * 0.6 + (1 - avgFlatness) * 0.4));

  // Danceability: steady rhythm + bass energy
  const rhythmConsistency = 1 - computeVariance(frames.map(f => f.rms));
  const danceability = Math.min(1, rhythmConsistency * 0.7 + energy * 0.3);

  // Acousticness: lower flatness = more harmonic = more acoustic
  const acousticness = Math.min(1, (1 - avgFlatness) * 0.8);

  // Instrumentalness: higher ZCR typically indicates vocals
  const normalizedZcr = Math.min(1, avgZcr / 0.3);
  const instrumentalness = Math.max(0, 1 - normalizedZcr);

  // Confidence based on number of frames analyzed
  const confidence = Math.min(1, n / 100);

  return {
    energy: clamp(energy),
    valence: clamp(valence),
    tempo: clamp(tempo, 60, 200),
    danceability: clamp(danceability),
    acousticness: clamp(acousticness),
    instrumentalness: clamp(instrumentalness),
    key,
    mode,
    analysisMethod: 'meyda',
    confidence,
    spectralFlatness: avgFlatness,
    spectralRolloff: avgRolloff,
    loudness: avgLoudness,
    perceptualSpread: avgSpread,
    chroma: avgChroma,
  };
}

/**
 * Detect musical key from chroma features
 */
function detectKeyFromChroma(chroma: number[]): { key: number; mode: number } {
  // Major and minor key profiles (Krumhansl-Kessler)
  const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  let bestKey = 0;
  let bestMode = 1;
  let bestCorrelation = -1;

  for (let key = 0; key < 12; key++) {
    // Rotate chroma to align with key
    const rotatedChroma = rotateArray(chroma, key);

    // Correlate with major profile
    const majorCorr = correlation(rotatedChroma, majorProfile);
    if (majorCorr > bestCorrelation) {
      bestCorrelation = majorCorr;
      bestKey = key;
      bestMode = 1;
    }

    // Correlate with minor profile
    const minorCorr = correlation(rotatedChroma, minorProfile);
    if (minorCorr > bestCorrelation) {
      bestCorrelation = minorCorr;
      bestKey = key;
      bestMode = 0;
    }
  }

  return { key: bestKey, mode: bestMode };
}

/**
 * Estimate tempo using onset detection
 */
function estimateTempoFromOnsets(
  channelData: Float32Array,
  sampleRate: number
): number {
  const windowSize = 1024;
  const hopSize = 512;
  const numWindows = Math.floor((channelData.length - windowSize) / hopSize);

  if (numWindows < 10) {
    return 120; // Default
  }

  // Compute spectral flux (onset detection function)
  const onsetFunction: number[] = [];
  let prevSpectrum: number[] | null = null;

  for (let i = 0; i < numWindows; i++) {
    const startSample = i * hopSize;
    const window = channelData.slice(startSample, startSample + windowSize);

    // Simple energy-based onset
    let energy = 0;
    for (let j = 0; j < window.length; j++) {
      energy += window[j] * window[j];
    }

    if (prevSpectrum !== null) {
      onsetFunction.push(Math.max(0, energy - prevSpectrum[0]));
    }
    prevSpectrum = [energy];
  }

  // Find peaks in onset function
  const threshold = onsetFunction.reduce((a, b) => a + b, 0) / onsetFunction.length * 1.5;
  const peaks: number[] = [];

  for (let i = 1; i < onsetFunction.length - 1; i++) {
    if (onsetFunction[i] > threshold &&
        onsetFunction[i] > onsetFunction[i - 1] &&
        onsetFunction[i] > onsetFunction[i + 1]) {
      peaks.push(i);
    }
  }

  if (peaks.length < 2) {
    return 120;
  }

  // Calculate inter-onset intervals
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }

  // Average interval in frames
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

  // Convert to BPM
  const framesPerSecond = sampleRate / hopSize;
  const beatsPerSecond = framesPerSecond / avgInterval;
  let bpm = beatsPerSecond * 60;

  // Normalize to reasonable range
  while (bpm < 60) bpm *= 2;
  while (bpm > 200) bpm /= 2;

  return Math.round(bpm);
}

// Helper functions

function rotateArray<T>(arr: T[], n: number): T[] {
  const len = arr.length;
  return arr.slice(len - n).concat(arr.slice(0, len - n));
}

function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  let sumA = 0;
  let sumB = 0;
  let sumA2 = 0;
  let sumB2 = 0;

  for (let i = 0; i < n; i++) {
    sum += a[i] * b[i];
    sumA += a[i];
    sumB += b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
  }

  const num = n * sum - sumA * sumB;
  const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));

  return den === 0 ? 0 : num / den;
}

function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function getDefaultMeydaResult(): MeydaAnalysisResult {
  return {
    energy: 0.5,
    valence: 0.5,
    tempo: 120,
    danceability: 0.5,
    acousticness: 0.5,
    instrumentalness: 0.1,
    key: 0,
    mode: 1,
    analysisMethod: 'synthetic',
    confidence: 0,
    spectralFlatness: 0.5,
    spectralRolloff: 4000,
    loudness: 0,
    perceptualSpread: 0.5,
    chroma: new Array(12).fill(0),
  };
}

/**
 * Analyze audio from URL using Meyda
 * This fetches the audio, decodes it, and analyzes
 */
export async function analyzeAudioFromUrl(
  url: string,
  videoId: string
): Promise<MeydaAnalysisResult> {
  try {
    // Create audio context
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    // Fetch audio data
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    // Decode audio
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Analyze
    const result = await analyzeAudioBuffer(audioBuffer, audioContext.sampleRate);

    // Clean up
    await audioContext.close();

    return result;
  } catch (error) {
    console.error(`Failed to analyze audio for ${videoId}:`, error);
    return getDefaultMeydaResult();
  }
}
