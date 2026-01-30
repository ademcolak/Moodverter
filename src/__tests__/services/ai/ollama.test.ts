import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isOllamaRunning, generate, embed } from '../../../services/ai/ollama';

describe('Ollama Service', () => {
  // Mock fetch global
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('isOllamaRunning', () => {
    it('should return true when Ollama is reachable', async () => {
      // Mock successful response
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }), // Ollama usually returns something simple
      });

      const running = await isOllamaRunning();
      expect(running).toBe(true);
    });

    it('should return false when Ollama is unreachable', async () => {
      // Mock network error
      (global.fetch as any).mockRejectedValue(new Error('Connection refused'));

      const running = await isOllamaRunning();
      expect(running).toBe(false);
    });
  });

  describe('generate', () => {
    it('should return generated text', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ response: 'Generated text' }),
      });

      const result = await generate('test prompt');
      expect(result).toBe('Generated text');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/generate'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('test prompt'),
        })
      );
    });

    it('should throw error on failure', async () => {
      (global.fetch as any).mockRejectedValue(new Error('API Error'));

      await expect(generate('test')).rejects.toThrow('API Error');
    });
  });

  describe('embed', () => {
    it('should return embeddings', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: mockEmbedding }),
      });

      const result = await embed('test text');
      expect(result).toEqual(mockEmbedding);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/embeddings'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('test text'),
        })
      );
    });
  });
});
