#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const CLI_PATH = path.resolve(ROOT, '.smoke-dist/tests/tuning-loop.cli.js');

const FIXTURE_TRACKS = [
  { id: 'trk-1', name: 'Pulse Avenue', artist: 'Unit A', durationMs: 182000 },
  { id: 'trk-2', name: 'Night Drive', artist: 'Unit B', durationMs: 176000 },
  { id: 'trk-3', name: 'Afterlight', artist: 'Unit C', durationMs: 189000 },
  { id: 'trk-4', name: 'Static Bloom', artist: 'Unit D', durationMs: 171000 },
  { id: 'trk-5', name: 'Echo Frame', artist: 'Unit E', durationMs: 194000 },
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed (exit ${code ?? 'unknown'})`));
    });
  });
}

async function assertArtifact(pathToArtifact, expectedMode) {
  const raw = await fs.readFile(pathToArtifact, 'utf-8');
  const artifact = JSON.parse(raw);
  if (artifact.mode !== expectedMode) {
    throw new Error(`Unexpected artifact mode: expected ${expectedMode}, got ${String(artifact.mode)}`);
  }

  if (expectedMode === 'single') {
    if (artifact.summary?.hitAt3 !== 1 || artifact.summary?.hitAt5 !== 1) {
      throw new Error('Single dry-run expected hit@3=1 and hit@5=1');
    }
  }

  if (expectedMode === 'search') {
    if (!artifact.search || !Array.isArray(artifact.search.ranking) || artifact.search.ranking.length < 2) {
      throw new Error('Search dry-run expected at least 2 ranked trials');
    }
    if (artifact.search.validationEnabled !== true || !artifact.search.validationResult) {
      throw new Error('Search dry-run expected validationEnabled=true with validationResult');
    }
  }
}

async function main() {
  await run('pnpm', ['run', 'smoke:compile']);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moodverter-tuning-dry-run-'));
  try {
    const singleInputPath = path.join(tmpDir, 'single-input.json');
    const singleOutputPath = path.join(tmpDir, 'single-output.json');
    const searchInputPath = path.join(tmpDir, 'search-input.json');
    const searchOutputPath = path.join(tmpDir, 'search-output.json');

    await fs.writeFile(singleInputPath, JSON.stringify({
      scopeId: 'pipeline-dry-run-single',
      limit: 5,
      goodThreshold: 0.35,
      requiredRelevantTargetsPerSeed: 2,
      runtimeGate: { enforce: false },
      tracks: FIXTURE_TRACKS,
      seedTrackIds: ['trk-1', 'trk-2', 'trk-3'],
      relevantTargetsBySeed: {
        'trk-1': ['trk-2', 'trk-4'],
        'trk-2': ['trk-1', 'trk-3'],
        'trk-3': ['trk-2', 'trk-5'],
      },
    }), 'utf-8');

    await fs.writeFile(searchInputPath, JSON.stringify({
      scopeId: 'pipeline-dry-run-search',
      limit: 5,
      goodThreshold: 0.35,
      requiredRelevantTargetsPerSeed: 2,
      runtimeGate: { enforce: false },
      tracks: FIXTURE_TRACKS,
      seedTrackIds: ['trk-1', 'trk-2', 'trk-3'],
      relevantTargetsBySeed: {
        'trk-1': ['trk-2', 'trk-4'],
        'trk-2': ['trk-1', 'trk-3'],
        'trk-3': ['trk-2', 'trk-5'],
      },
      search: {
        validateBestWithGates: true,
        trials: [
          {
            id: 'trial-a',
            limit: 5,
            goodThreshold: 0.35,
            enforceRegressionGate: false,
            enforceTuningValidationGate: false,
            enforceRelevantTargetMinimum: true,
            enforceRuntimeGate: false,
          },
          {
            id: 'trial-b',
            limit: 3,
            goodThreshold: 0.25,
            enforceRegressionGate: false,
            enforceTuningValidationGate: false,
            enforceRelevantTargetMinimum: true,
            enforceRuntimeGate: false,
          },
        ],
      },
    }), 'utf-8');

    await run(process.execPath, [CLI_PATH, '--input', singleInputPath, '--output', singleOutputPath]);
    await run(process.execPath, [CLI_PATH, '--input', searchInputPath, '--output', searchOutputPath]);

    await assertArtifact(singleOutputPath, 'single');
    await assertArtifact(searchOutputPath, 'search');

    process.stdout.write('[tuning:dry-run] PASS: single + search fixtures validated.\n');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  process.stderr.write(`[tuning:dry-run] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
