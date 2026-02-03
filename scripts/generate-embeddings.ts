#!/usr/bin/env npx tsx
/**
 * Generate embeddings for mood presets using Ollama
 *
 * Usage: pnpm run generate:embeddings
 *
 * This script:
 * 1. Loads existing mood-presets.json
 * 2. Generates embeddings for each phrase using Ollama nomic-embed-text
 * 3. Updates the JSON file with embeddings
 */

import * as fs from 'fs';
import * as path from 'path';

const OLLAMA_URL = 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';
const PRESETS_PATH = path.join(__dirname, '../src/data/mood-presets.json');

interface MoodParams {
  energy: number;
  valence: number;
  danceability: number;
  tempo: { min: number; max: number };
  acousticness?: number;
  instrumentalness?: number;
}

interface MoodPreset {
  category: string;
  phrases: string[];
  params: MoodParams;
  embeddings: number[][];
}

interface PresetsFile {
  version: string;
  generatedAt: string;
  model: string;
  embedModel: string;
  presets: MoodPreset[];
}

async function checkOllama(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

async function checkModel(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) return false;

    const data = await response.json();
    const models = data.models.map((m: { name: string }) => m.name);
    return models.some((m: string) => m.startsWith(EMBED_MODEL));
  } catch {
    return false;
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBED_MODEL,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding generation failed: ${await response.text()}`);
  }

  const data = await response.json();
  return data.embedding;
}

async function main() {
  console.log('Mood Preset Embedding Generator');
  console.log('================================\n');

  // Check Ollama is running
  console.log('Checking Ollama...');
  if (!(await checkOllama())) {
    console.error('ERROR: Ollama is not running!');
    console.error('Please start Ollama with: ollama serve');
    process.exit(1);
  }
  console.log('  Ollama is running');

  // Check model is available
  console.log(`Checking ${EMBED_MODEL} model...`);
  if (!(await checkModel())) {
    console.error(`ERROR: Model ${EMBED_MODEL} is not available!`);
    console.error(`Please pull the model with: ollama pull ${EMBED_MODEL}`);
    process.exit(1);
  }
  console.log(`  ${EMBED_MODEL} is available`);

  // Load presets
  console.log('\nLoading presets...');
  const presetsContent = fs.readFileSync(PRESETS_PATH, 'utf-8');
  const presets: PresetsFile = JSON.parse(presetsContent);
  console.log(`  Found ${presets.presets.length} preset categories`);

  // Count total phrases
  const totalPhrases = presets.presets.reduce((sum, p) => sum + p.phrases.length, 0);
  console.log(`  Total phrases to embed: ${totalPhrases}`);

  // Generate embeddings
  console.log('\nGenerating embeddings...');
  let completed = 0;

  for (const preset of presets.presets) {
    console.log(`\n  Category: ${preset.category}`);
    preset.embeddings = [];

    for (const phrase of preset.phrases) {
      try {
        const embedding = await generateEmbedding(phrase);
        preset.embeddings.push(embedding);
        completed++;

        // Progress indicator
        process.stdout.write(`    [${completed}/${totalPhrases}] "${phrase}" (${embedding.length} dims)\n`);
      } catch (error) {
        console.error(`    ERROR: Failed to embed "${phrase}":`, error);
        preset.embeddings.push([]); // Empty fallback
      }
    }
  }

  // Update metadata
  presets.generatedAt = new Date().toISOString();
  presets.model = 'ollama';
  presets.embedModel = EMBED_MODEL;

  // Save updated presets
  console.log('\nSaving updated presets...');
  fs.writeFileSync(PRESETS_PATH, JSON.stringify(presets, null, 2));
  console.log(`  Saved to ${PRESETS_PATH}`);

  // Summary
  console.log('\n================================');
  console.log('Summary:');
  console.log(`  Categories: ${presets.presets.length}`);
  console.log(`  Phrases embedded: ${completed}/${totalPhrases}`);
  console.log(`  Embedding dimensions: ${presets.presets[0]?.embeddings[0]?.length || 0}`);
  console.log(`  File updated: ${presets.generatedAt}`);
  console.log('\nDone!');
}

main().catch(console.error);
