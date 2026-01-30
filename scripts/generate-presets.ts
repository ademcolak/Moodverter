#!/usr/bin/env npx tsx
/**
 * Mood Preset Generator
 *
 * Generates mood presets with embeddings using Ollama.
 * Run with: npx tsx scripts/generate-presets.ts
 *
 * Requirements:
 * - Ollama running locally (ollama serve)
 * - Models installed: llama3.2:3b, nomic-embed-text
 */

const OLLAMA_URL = 'http://localhost:11434';
const LLM_MODEL = 'llama3.2:3b';
const EMBED_MODEL = 'nomic-embed-text';
const OUTPUT_PATH = './src/data/mood-presets.json';

interface MoodPreset {
  category: string;
  phrases: string[];
  params: {
    energy: number;
    valence: number;
    danceability: number;
    tempo: { min: number; max: number };
    acousticness?: number;
    instrumentalness?: number;
  };
  embeddings: number[][];
}

interface PresetsData {
  version: string;
  generatedAt: string;
  model: string;
  embedModel: string;
  presets: MoodPreset[];
}

// Base presets - these define the core mood categories with their audio params
const BASE_PRESETS: Omit<MoodPreset, 'embeddings'>[] = [
  // High Energy / Positive
  {
    category: 'energetic',
    phrases: ['energetic', 'pumped up', 'enerjik', 'fired up', 'coşkulu'],
    params: { energy: 0.85, valence: 0.75, danceability: 0.80, tempo: { min: 120, max: 150 } },
  },
  {
    category: 'happy',
    phrases: ['happy', 'joyful', 'mutlu', 'neşeli', 'cheerful'],
    params: { energy: 0.70, valence: 0.90, danceability: 0.75, tempo: { min: 100, max: 130 } },
  },
  {
    category: 'party',
    phrases: ['party', 'celebration', 'parti', 'festival', 'club vibes'],
    params: { energy: 0.90, valence: 0.80, danceability: 0.90, tempo: { min: 120, max: 140 } },
  },
  {
    category: 'workout',
    phrases: ['workout', 'gym', 'exercise', 'spor', 'training'],
    params: { energy: 0.95, valence: 0.65, danceability: 0.75, tempo: { min: 130, max: 160 } },
  },
  {
    category: 'confident',
    phrases: ['confident', 'powerful', 'güçlü', 'bold', 'empowering'],
    params: { energy: 0.80, valence: 0.70, danceability: 0.65, tempo: { min: 100, max: 130 } },
  },

  // Medium Energy / Balanced
  {
    category: 'chill',
    phrases: ['chill', 'relaxed', 'rahat', 'laid back', 'easygoing'],
    params: { energy: 0.40, valence: 0.60, danceability: 0.50, tempo: { min: 80, max: 110 } },
  },
  {
    category: 'focused',
    phrases: ['focused', 'concentration', 'odaklı', 'study', 'work mode'],
    params: { energy: 0.45, valence: 0.50, danceability: 0.30, tempo: { min: 90, max: 120 }, instrumentalness: 0.7 },
  },
  {
    category: 'romantic',
    phrases: ['romantic', 'love', 'aşk', 'intimate', 'tender'],
    params: { energy: 0.35, valence: 0.65, danceability: 0.45, tempo: { min: 70, max: 100 } },
  },
  {
    category: 'groovy',
    phrases: ['groovy', 'funky', 'rhythm', 'groove', 'smooth'],
    params: { energy: 0.65, valence: 0.70, danceability: 0.85, tempo: { min: 95, max: 115 } },
  },
  {
    category: 'dreamy',
    phrases: ['dreamy', 'ethereal', 'rüya gibi', 'floating', 'atmospheric'],
    params: { energy: 0.30, valence: 0.55, danceability: 0.35, tempo: { min: 70, max: 100 }, acousticness: 0.6 },
  },

  // Low Energy / Calm
  {
    category: 'calm',
    phrases: ['calm', 'peaceful', 'sakin', 'serene', 'tranquil'],
    params: { energy: 0.20, valence: 0.55, danceability: 0.25, tempo: { min: 60, max: 85 }, acousticness: 0.7 },
  },
  {
    category: 'sleepy',
    phrases: ['sleepy', 'bedtime', 'uykulu', 'lullaby', 'night time'],
    params: { energy: 0.15, valence: 0.45, danceability: 0.15, tempo: { min: 50, max: 75 }, instrumentalness: 0.6 },
  },
  {
    category: 'acoustic',
    phrases: ['acoustic', 'unplugged', 'akustik', 'organic', 'raw'],
    params: { energy: 0.35, valence: 0.55, danceability: 0.40, tempo: { min: 80, max: 110 }, acousticness: 0.85 },
  },

  // Emotional / Introspective
  {
    category: 'melancholic',
    phrases: ['melancholic', 'bittersweet', 'melankolik', 'wistful', 'hüzünlü ama güzel'],
    params: { energy: 0.30, valence: 0.25, danceability: 0.30, tempo: { min: 70, max: 100 } },
  },
  {
    category: 'sad',
    phrases: ['sad', 'heartbroken', 'üzgün', 'blue', 'crying'],
    params: { energy: 0.20, valence: 0.15, danceability: 0.20, tempo: { min: 60, max: 90 } },
  },
  {
    category: 'nostalgic',
    phrases: ['nostalgic', 'memories', 'nostaljik', 'throwback', 'reminiscing'],
    params: { energy: 0.40, valence: 0.45, danceability: 0.35, tempo: { min: 80, max: 110 } },
  },
  {
    category: 'angry',
    phrases: ['angry', 'aggressive', 'kızgın', 'intense', 'rage'],
    params: { energy: 0.90, valence: 0.20, danceability: 0.55, tempo: { min: 120, max: 160 } },
  },
  {
    category: 'anxious',
    phrases: ['anxious', 'tense', 'endişeli', 'nervous', 'restless'],
    params: { energy: 0.60, valence: 0.25, danceability: 0.40, tempo: { min: 100, max: 140 } },
  },

  // Activity / Context
  {
    category: 'driving',
    phrases: ['driving', 'road trip', 'yolculuk', 'highway', 'cruising'],
    params: { energy: 0.65, valence: 0.70, danceability: 0.60, tempo: { min: 100, max: 130 } },
  },
  {
    category: 'cooking',
    phrases: ['cooking', 'kitchen', 'yemek yapma', 'dinner party', 'chef mode'],
    params: { energy: 0.55, valence: 0.75, danceability: 0.65, tempo: { min: 90, max: 120 } },
  },
  {
    category: 'morning',
    phrases: ['morning', 'wake up', 'sabah', 'sunrise', 'fresh start'],
    params: { energy: 0.50, valence: 0.70, danceability: 0.45, tempo: { min: 90, max: 115 } },
  },
  {
    category: 'late_night',
    phrases: ['late night', 'midnight', 'gece', 'after hours', '3am vibes'],
    params: { energy: 0.35, valence: 0.40, danceability: 0.45, tempo: { min: 80, max: 110 } },
  },

  // Genre-inspired
  {
    category: 'indie',
    phrases: ['indie', 'alternative', 'alternatif', 'underground', 'hipster'],
    params: { energy: 0.50, valence: 0.55, danceability: 0.50, tempo: { min: 90, max: 130 } },
  },
  {
    category: 'electronic',
    phrases: ['electronic', 'synth', 'elektronik', 'digital', 'techno vibes'],
    params: { energy: 0.75, valence: 0.60, danceability: 0.80, tempo: { min: 115, max: 140 } },
  },
  {
    category: 'jazz',
    phrases: ['jazz', 'swing', 'caz', 'smooth jazz', 'bebop'],
    params: { energy: 0.45, valence: 0.60, danceability: 0.55, tempo: { min: 80, max: 140 }, instrumentalness: 0.5 },
  },
  {
    category: 'classical',
    phrases: ['classical', 'orchestral', 'klasik', 'symphony', 'chamber'],
    params: { energy: 0.40, valence: 0.50, danceability: 0.20, tempo: { min: 60, max: 140 }, instrumentalness: 0.9 },
  },
  {
    category: 'lofi',
    phrases: ['lofi', 'lo-fi', 'beats to study', 'chillhop', 'cafe vibes'],
    params: { energy: 0.35, valence: 0.55, danceability: 0.45, tempo: { min: 70, max: 95 }, instrumentalness: 0.7 },
  },
];

async function checkOllama(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

async function embed(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });

  if (!response.ok) {
    throw new Error(`Embedding failed: ${await response.text()}`);
  }

  const data = await response.json();
  return data.embedding;
}

async function main() {
  console.log('Mood Preset Generator');
  console.log('=====================\n');

  // Check Ollama
  const ollamaRunning = await checkOllama();
  if (!ollamaRunning) {
    console.error('Error: Ollama is not running!');
    console.log('\nPlease start Ollama:');
    console.log('  brew install ollama');
    console.log('  ollama serve');
    console.log('  ollama pull nomic-embed-text');
    process.exit(1);
  }

  console.log('Ollama is running');
  console.log(`Generating embeddings for ${BASE_PRESETS.length} presets...\n`);

  const presets: MoodPreset[] = [];

  for (const base of BASE_PRESETS) {
    process.stdout.write(`  ${base.category}... `);

    const embeddings: number[][] = [];
    for (const phrase of base.phrases) {
      const embedding = await embed(phrase);
      embeddings.push(embedding);
    }

    presets.push({ ...base, embeddings });
    console.log('done');
  }

  const output: PresetsData = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    model: LLM_MODEL,
    embedModel: EMBED_MODEL,
    presets,
  };

  const fs = await import('fs');
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`\nGenerated ${presets.length} presets`);
  console.log(`Saved to: ${OUTPUT_PATH}`);
}

main().catch(console.error);
