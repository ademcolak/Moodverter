import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

interface FixtureTrack {
  id: string;
  name: string;
  artist: string;
  durationMs: number;
}

const FIXTURE_TRACKS: FixtureTrack[] = [
  { id: 'trk-1', name: 'Pulse Avenue', artist: 'Unit A', durationMs: 182_000 },
  { id: 'trk-2', name: 'Night Drive', artist: 'Unit B', durationMs: 176_000 },
  { id: 'trk-3', name: 'Afterlight', artist: 'Unit C', durationMs: 189_000 },
  { id: 'trk-4', name: 'Static Bloom', artist: 'Unit D', durationMs: 171_000 },
  { id: 'trk-5', name: 'Echo Frame', artist: 'Unit E', durationMs: 194_000 },
];

function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const workspaceRoot = path.resolve(__dirname, '..', '..');
  const cliPath = path.resolve(__dirname, 'tuning-loop.cli.js');

  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cliPath, ...args], { cwd: workspaceRoot }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`tuning-loop cli failed: ${stderr || error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'moodverter-tuning-loop-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('tuning-loop cli single mode writes artifact', async () => {
  await withTempDir(async (tmpDir) => {
    const inputPath = path.join(tmpDir, 'single-input.json');
    const outputPath = path.join(tmpDir, 'single-output.json');

    await fs.writeFile(inputPath, JSON.stringify({
      scopeId: 'smoke-single-2026-02-20',
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

    const execution = await runCli(['--input', inputPath, '--output', outputPath]);
    assert.match(execution.stdout, /\[tuning:loop\] scoring=v2/);

    const artifactRaw = await fs.readFile(outputPath, 'utf-8');
    const artifact = JSON.parse(artifactRaw) as Record<string, unknown>;

    assert.equal(artifact.mode, 'single');
    assert.equal(typeof artifact.generatedAt, 'string');

    const summary = artifact.summary as Record<string, unknown>;
    assert.equal(summary.hitAt3, 1);
    assert.equal(summary.hitAt5, 1);
  });
});

test('tuning-loop cli search mode ranks trials and validates best trial', async () => {
  await withTempDir(async (tmpDir) => {
    const inputPath = path.join(tmpDir, 'search-input.json');
    const outputPath = path.join(tmpDir, 'search-output.json');

    await fs.writeFile(inputPath, JSON.stringify({
      scopeId: 'smoke-search-2026-02-20',
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

    const execution = await runCli(['--input', inputPath, '--output', outputPath]);
    assert.match(execution.stdout, /\[tuning:loop\]\[search\] trial-a objective=/);
    assert.match(execution.stdout, /\[tuning:loop\]\[best\] scoring=v2/);

    const artifactRaw = await fs.readFile(outputPath, 'utf-8');
    const artifact = JSON.parse(artifactRaw) as Record<string, unknown>;

    assert.equal(artifact.mode, 'search');

    const search = artifact.search as Record<string, unknown>;
    assert.equal(search.trialCount, 2);
    assert.equal(search.validationEnabled, true);

    const ranking = search.ranking as Array<Record<string, unknown>>;
    assert.equal(Array.isArray(ranking), true);
    assert.equal(ranking.length, 2);

    const validationResult = search.validationResult as Record<string, unknown>;
    assert.equal(typeof validationResult.scopeId, 'string');
    assert.equal(validationResult.relevanceTargetGatePassed, true);
  });
});
