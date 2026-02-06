import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isOllamaRunning, generate, embed } from '../../../services/ai/ollama';

describe('Ollama Service', () => {
  // Mock fetch global
  const originalFetch = global.fetch;
  const response = (body: unknown, ok = true): Response => ({
    ok,
    json: async () => body,
  } as Response);

  beforeEach(() => {
    global.fetch = vi.fn() as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('isOllamaRunning', () => {
    it('should return true when Ollama is reachable', async () => {
      // Mock successful response
      vi.mocked(global.fetch).mockResolvedValue(response({ status: 'ok' }));

      const running = await isOllamaRunning();
      expect(running).toBe(true);
    });

    it('should return false when Ollama is unreachable', async () => {
      // Mock network error
      vi.mocked(global.fetch).mockRejectedValue(new Error('Connection refused'));

      const running = await isOllamaRunning();
      expect(running).toBe(false);
    });
  });

  describe('generate', () => {
    it('should return generated text', async () => {
      vi.mocked(global.fetch).mockResolvedValue(response({ response: 'Generated text' }));

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
      vi.mocked(global.fetch).mockRejectedValue(new Error('API Error'));

      await expect(generate('test')).rejects.toThrow('API Error');
    });
  });

  describe('embed', () => {
    it('should return embeddings', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      vi.mocked(global.fetch).mockResolvedValue(response({ embedding: mockEmbedding }));

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
