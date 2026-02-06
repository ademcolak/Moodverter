import { describe, it, expect, vi, beforeEach } from 'vitest';
import Meyda from 'meyda';
import { analyzeAudioBuffer, createMeydaAnalyzer } from '../../../services/audio/meydaAnalyzer';

vi.mock('meyda', () => ({
  default: {
    extract: vi.fn(),
    createMeydaAnalyzer: vi.fn(() => ({
      start: vi.fn(),
      stop: vi.fn(),
    })),
  },
}));

function createBuffer(length: number, sampleRate = 44100): AudioBuffer {
  const data = new Float32Array(length);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.sin(i / 25);
  }

  return {
    sampleRate,
    getChannelData: vi.fn(() => data),
  } as unknown as AudioBuffer;
}

describe('Meyda analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns defaults when audio is too short', async () => {
    const shortBuffer = createBuffer(2048 + 1024 * 5);

    const result = await analyzeAudioBuffer(shortBuffer);

    expect(result.analysisMethod).toBe('synthetic');
    expect(result.confidence).toBe(0);
    expect(result.tempo).toBe(120);
  });

  it('extracts features for valid audio', async () => {
    const extractMock = vi.mocked(Meyda.extract);
    extractMock.mockReturnValue({
      rms: 0.4,
      energy: 0.5,
      spectralCentroid: 2200,
      spectralRolloff: 4500,
      spectralFlatness: 0.3,
      zcr: 0.08,
      loudness: {
        specific: new Float32Array(24),
        total: 22,
      },
      perceptualSpread: 0.6,
      chroma: [0.1, 0.4, 0.2, 0.1, 0.6, 0.2, 0.1, 0.3, 0.2, 0.1, 0.2, 0.1],
    });

    const buffer = createBuffer(2048 + 1024 * 80);
    const result = await analyzeAudioBuffer(buffer);

    expect(result.analysisMethod).toBe('meyda');
    expect(result.confidence).toBeGreaterThan(0.1);
    expect(result.energy).toBeGreaterThanOrEqual(0);
    expect(result.energy).toBeLessThanOrEqual(1);
    expect(result.chroma).toHaveLength(12);
  });

  it('starts and stops realtime analyzer', () => {
    const startSpy = vi.fn();
    const stopSpy = vi.fn();

    vi.mocked(Meyda.createMeydaAnalyzer).mockReturnValue({
      start: startSpy,
      stop: stopSpy,
    } as unknown as ReturnType<typeof Meyda.createMeydaAnalyzer>);

    const analyzer = createMeydaAnalyzer(
      {} as AudioContext,
      {} as AudioNode,
      vi.fn()
    );

    analyzer.start();
    analyzer.stop();

    expect(Meyda.createMeydaAnalyzer).toHaveBeenCalled();
    expect(startSpy).toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalled();
  });
});
