// Ollama Service - Local AI integration for mood parsing

const OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_LLM_MODEL = 'llama3.2:3b';
const DEFAULT_EMBED_MODEL = 'nomic-embed-text';

export interface OllamaStatus {
  isRunning: boolean;
  models: string[];
  error?: string;
}

export interface GenerateOptions {
  model?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface EmbedOptions {
  model?: string;
}

// Check if Ollama is running
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Get Ollama status with available models
export async function getOllamaStatus(): Promise<OllamaStatus> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return { isRunning: false, models: [], error: 'Connection failed' };
    }

    const data = await response.json();
    const models = (data.models ?? []).map((m: { name: string }) => m.name);

    return { isRunning: true, models };
  } catch (error) {
    return {
      isRunning: false,
      models: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Check if a specific model is available
export async function isModelAvailable(model: string): Promise<boolean> {
  const status = await getOllamaStatus();
  return status.models.some(m => m.startsWith(model));
}

// Generate text using Ollama LLM
export async function generate(
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const model = options.model ?? DEFAULT_LLM_MODEL;

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      system: options.system,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.3,
        num_predict: options.maxTokens ?? 500,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama generate failed: ${error}`);
  }

  const data = await response.json();
  return data.response;
}

// Generate embeddings using Ollama
export async function embed(
  text: string,
  options: EmbedOptions = {}
): Promise<number[]> {
  const model = options.model ?? DEFAULT_EMBED_MODEL;

  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama embed failed: ${error}`);
  }

  const data = await response.json();
  return data.embedding;
}

// Batch embed multiple texts
export async function embedBatch(
  texts: string[],
  options: EmbedOptions = {}
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (const text of texts) {
    const embedding = await embed(text, options);
    embeddings.push(embedding);
  }

  return embeddings;
}

// Cosine similarity between two vectors
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

// Parse JSON from LLM response (handles markdown code blocks)
export function parseJsonResponse<T>(response: string): T | null {
  // Try to extract JSON from markdown code block
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonString = jsonMatch ? jsonMatch[1].trim() : response.trim();

  try {
    return JSON.parse(jsonString) as T;
  } catch {
    // Try to find JSON object in response
    const objectMatch = jsonString.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
