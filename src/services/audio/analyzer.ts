// Audio Analyzer - Extract audio features using Web Audio API
// Provides Spotify-compatible audio features for YouTube videos

import type { AudioFeatures } from '../../types/provider';

export interface AnalysisResult extends AudioFeatures {
  // Additional metadata
  analyzedAt: number;
  sampleCount: number;
}

interface AnalysisBuffer {
  rms: number[];
  spectralCentroid: number[];
  zeroCrossings: number[];
  lowFreqEnergy: number[];
  midFreqEnergy: number[];
  highFreqEnergy: number[];
}

// Cache for analysis results
const analysisCache = new Map<string, AnalysisResult>();

// Get cached analysis
export function getCachedAnalysis(videoId: string): AnalysisResult | null {
  return analysisCache.get(videoId) ?? null;
}

// Store analysis in cache
export function cacheAnalysis(videoId: string, result: AnalysisResult): void {
  analysisCache.set(videoId, result);

  // Also persist to localStorage
  try {
    const stored = localStorage.getItem('moodverter_audio_cache') ?? '{}';
    const cache = JSON.parse(stored);
    cache[videoId] = result;
    localStorage.setItem('moodverter_audio_cache', JSON.stringify(cache));
  } catch {
    // Ignore storage errors
  }
}

// Load cache from localStorage
export function loadCacheFromStorage(): void {
  try {
    const stored = localStorage.getItem('moodverter_audio_cache');
    if (stored) {
      const cache = JSON.parse(stored);
      for (const [key, value] of Object.entries(cache)) {
        analysisCache.set(key, value as AnalysisResult);
      }
    }
  } catch {
    // Ignore load errors
  }
}

// Initialize cache on module load
loadCacheFromStorage();

// Analyze audio from HTMLMediaElement (audio/video)
export async function analyzeMediaElement(
  element: HTMLAudioElement | HTMLVideoElement,
  videoId: string,
  durationSeconds = 30
): Promise<AnalysisResult> {
  // Check cache first
  const cached = getCachedAnalysis(videoId);
  if (cached) {
    return cached;
  }

  const audioContext = new AudioContext();
  const source = audioContext.createMediaElementSource(element);
  const analyser = audioContext.createAnalyser();

  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  source.connect(analyser);
  analyser.connect(audioContext.destination);

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const timeDataArray = new Uint8Array(analyser.fftSize);

  const analysisBuffer: AnalysisBuffer = {
    rms: [],
    spectralCentroid: [],
    zeroCrossings: [],
    lowFreqEnergy: [],
    midFreqEnergy: [],
    highFreqEnergy: [],
  };

  // Analyze for specified duration
  const startTime = Date.now();
  const endTime = startTime + durationSeconds * 1000;

  return new Promise((resolve) => {
    const analyze = () => {
      if (Date.now() >= endTime || element.paused || element.ended) {
        // Compute final features
        const result = computeFeatures(analysisBuffer, audioContext.sampleRate);
        cacheAnalysis(videoId, result);

        source.disconnect();
        analyser.disconnect();
        audioContext.close();

        resolve(result);
        return;
      }

      // Get frequency data
      analyser.getByteFrequencyData(dataArray);
      analyser.getByteTimeDomainData(timeDataArray);

      // Compute frame features
      const rms = computeRMS(timeDataArray);
      const spectralCentroid = computeSpectralCentroid(dataArray, audioContext.sampleRate);
      const zeroCrossings = computeZeroCrossings(timeDataArray);
      const { low, mid, high } = computeFrequencyBands(dataArray, bufferLength);

      analysisBuffer.rms.push(rms);
      analysisBuffer.spectralCentroid.push(spectralCentroid);
      analysisBuffer.zeroCrossings.push(zeroCrossings);
      analysisBuffer.lowFreqEnergy.push(low);
      analysisBuffer.midFreqEnergy.push(mid);
      analysisBuffer.highFreqEnergy.push(high);

      requestAnimationFrame(analyze);
    };

    analyze();
  });
}

// Compute RMS (Root Mean Square) - measure of loudness
function computeRMS(timeData: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const sample = (timeData[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / timeData.length);
}

// Compute spectral centroid - brightness of sound
function computeSpectralCentroid(freqData: Uint8Array, sampleRate: number): number {
  let weightedSum = 0;
  let sum = 0;

  for (let i = 0; i < freqData.length; i++) {
    const frequency = (i * sampleRate) / (2 * freqData.length);
    const amplitude = freqData[i];
    weightedSum += frequency * amplitude;
    sum += amplitude;
  }

  return sum > 0 ? weightedSum / sum : 0;
}

// Count zero crossings - measure of noisiness/percussiveness
function computeZeroCrossings(timeData: Uint8Array): number {
  let crossings = 0;
  for (let i = 1; i < timeData.length; i++) {
    if ((timeData[i - 1] < 128 && timeData[i] >= 128) ||
        (timeData[i - 1] >= 128 && timeData[i] < 128)) {
      crossings++;
    }
  }
  return crossings;
}

// Compute energy in frequency bands
function computeFrequencyBands(freqData: Uint8Array, bufferLength: number): {
  low: number;
  mid: number;
  high: number;
} {
  // Assuming 44100 sample rate, each bin is ~21.5 Hz
  // Low: 0-300 Hz, Mid: 300-2000 Hz, High: 2000+ Hz
  const lowEnd = Math.floor(bufferLength * 0.07);  // ~300 Hz
  const midEnd = Math.floor(bufferLength * 0.46);  // ~2000 Hz

  let low = 0, mid = 0, high = 0;

  for (let i = 0; i < bufferLength; i++) {
    const energy = freqData[i] * freqData[i];
    if (i < lowEnd) {
      low += energy;
    } else if (i < midEnd) {
      mid += energy;
    } else {
      high += energy;
    }
  }

  // Normalize
  low = Math.sqrt(low / lowEnd);
  mid = Math.sqrt(mid / (midEnd - lowEnd));
  high = Math.sqrt(high / (bufferLength - midEnd));

  return { low, mid, high };
}

// Compute final audio features from analysis buffer
function computeFeatures(buffer: AnalysisBuffer, sampleRate: number): AnalysisResult {
  const n = buffer.rms.length;
  if (n === 0) {
    return getDefaultFeatures();
  }

  // Average RMS → Energy (0-1)
  const avgRms = buffer.rms.reduce((a, b) => a + b, 0) / n;
  const energy = Math.min(1, avgRms * 3); // Scale to 0-1

  // Spectral centroid → rough tempo/brightness indicator
  const avgCentroid = buffer.spectralCentroid.reduce((a, b) => a + b, 0) / n;

  // High frequency energy ratio → estimate brightness/energy
  const avgHigh = buffer.highFreqEnergy.reduce((a, b) => a + b, 0) / n;
  const avgMid = buffer.midFreqEnergy.reduce((a, b) => a + b, 0) / n;
  const avgLow = buffer.lowFreqEnergy.reduce((a, b) => a + b, 0) / n;
  const totalEnergy = avgLow + avgMid + avgHigh;

  // Danceability: based on low frequency energy (bass) and consistency
  const bassRatio = totalEnergy > 0 ? avgLow / totalEnergy : 0.33;
  const rmsVariance = computeVariance(buffer.rms);
  const danceability = Math.min(1, (bassRatio * 1.5 + (1 - rmsVariance) * 0.5));

  // Valence: harder to estimate without ML, use brightness as proxy
  // Higher spectral centroid and more mid-range = happier sounding
  const midRatio = totalEnergy > 0 ? avgMid / totalEnergy : 0.33;
  const valence = Math.min(1, (midRatio + avgCentroid / 4000) / 2);

  // Acousticness: lower high frequency energy suggests acoustic
  const highRatio = totalEnergy > 0 ? avgHigh / totalEnergy : 0.33;
  const acousticness = Math.max(0, 1 - highRatio * 2);

  // Instrumentalness: harder to detect, use zero crossings as proxy
  // Vocal tracks tend to have more zero crossings
  const avgZeroCrossings = buffer.zeroCrossings.reduce((a, b) => a + b, 0) / n;
  const normalizedZC = avgZeroCrossings / 500; // Normalize
  const instrumentalness = Math.max(0, Math.min(1, 1 - normalizedZC));

  // Tempo estimation (very rough - proper BPM detection needs onset detection)
  // Use RMS peaks as proxy for beats
  const estimatedTempo = estimateTempo(buffer.rms, sampleRate);

  // Key and mode: would need proper pitch detection
  // Use placeholder values
  const key = Math.floor(avgCentroid / 100) % 12;
  const mode = valence > 0.5 ? 1 : 0; // Major if positive valence

  return {
    energy: clamp(energy),
    valence: clamp(valence),
    tempo: clamp(estimatedTempo, 60, 200),
    danceability: clamp(danceability),
    acousticness: clamp(acousticness),
    instrumentalness: clamp(instrumentalness),
    key,
    mode,
    analyzedAt: Date.now(),
    sampleCount: n,
  };
}

// Rough tempo estimation from RMS peaks
function estimateTempo(rmsValues: number[], _sampleRate: number): number {
  if (rmsValues.length < 10) {
    return 120; // Default
  }

  // Find peaks in RMS (potential beats)
  const peaks: number[] = [];
  const threshold = rmsValues.reduce((a, b) => a + b) / rmsValues.length * 1.2;

  for (let i = 1; i < rmsValues.length - 1; i++) {
    if (rmsValues[i] > threshold &&
        rmsValues[i] > rmsValues[i - 1] &&
        rmsValues[i] > rmsValues[i + 1]) {
      peaks.push(i);
    }
  }

  if (peaks.length < 2) {
    return 120;
  }

  // Calculate average interval between peaks
  let intervalSum = 0;
  for (let i = 1; i < peaks.length; i++) {
    intervalSum += peaks[i] - peaks[i - 1];
  }
  const avgInterval = intervalSum / (peaks.length - 1);

  // Convert to BPM (assuming ~60fps analysis)
  const framesPerSecond = 60;
  const beatsPerSecond = framesPerSecond / avgInterval;
  const bpm = beatsPerSecond * 60;

  // Normalize to reasonable range
  let normalizedBpm = bpm;
  while (normalizedBpm < 60) normalizedBpm *= 2;
  while (normalizedBpm > 200) normalizedBpm /= 2;

  return Math.round(normalizedBpm);
}

function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b) / values.length;
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b) / values.length);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function getDefaultFeatures(): AnalysisResult {
  return {
    energy: 0.5,
    valence: 0.5,
    tempo: 120,
    danceability: 0.5,
    acousticness: 0.5,
    instrumentalness: 0,
    key: 0,
    mode: 1,
    analyzedAt: Date.now(),
    sampleCount: 0,
  };
}

// Generate synthetic features based on metadata (fallback)
export function generateSyntheticFeatures(
  title: string,
  _artist: string
): AudioFeatures {
  const lowerTitle = title.toLowerCase();

  // Keyword-based estimation
  let energy = 0.5;
  let valence = 0.5;
  let danceability = 0.5;
  let acousticness = 0.3;
  let tempo = 120;

  // Energy keywords
  if (/rock|metal|punk|hardcore|intense/i.test(lowerTitle)) {
    energy = 0.85;
    valence = 0.6;
  } else if (/chill|calm|relax|ambient|sleep/i.test(lowerTitle)) {
    energy = 0.2;
    valence = 0.5;
  } else if (/electronic|edm|house|techno|dance/i.test(lowerTitle)) {
    energy = 0.8;
    danceability = 0.85;
    tempo = 128;
  }

  // Valence keywords
  if (/happy|joy|upbeat|celebration|party/i.test(lowerTitle)) {
    valence = 0.85;
  } else if (/sad|melancholy|dark|lonely|cry/i.test(lowerTitle)) {
    valence = 0.2;
  }

  // Acoustic keywords
  if (/acoustic|unplugged|live|piano|guitar solo/i.test(lowerTitle)) {
    acousticness = 0.8;
    energy = 0.4;
  }

  // Tempo keywords
  if (/slow|ballad|lullaby/i.test(lowerTitle)) {
    tempo = 70;
  } else if (/fast|rapid|energetic/i.test(lowerTitle)) {
    tempo = 140;
  }

  return {
    energy: clamp(energy),
    valence: clamp(valence),
    tempo,
    danceability: clamp(danceability),
    acousticness: clamp(acousticness),
    instrumentalness: 0.1,
    key: 0,
    mode: valence > 0.5 ? 1 : 0,
  };
}

export function clearAnalysisCache(): void {
  analysisCache.clear();
  localStorage.removeItem('moodverter_audio_cache');
}
