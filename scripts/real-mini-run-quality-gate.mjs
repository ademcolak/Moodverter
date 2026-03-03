#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const CLI_PATH = path.resolve(ROOT, '.smoke-dist/tests/tuning-loop.cli.js');
const REAL_MINI_RUN_SEED_COUNT = 10;

const TRACKS = Array.from({ length: 14 }, (_, index) => {
  const id = `real-mini-${index + 1}`;
  return {
    id,
    name: `Real Mini Track ${index + 1}`,
    artist: `Mini Artist ${Math.floor(index / 2) + 1}`,
    durationMs: 168000 + index * 2300,
  };
});

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

async function main() {
  await run('pnpm', ['run', 'smoke:compile']);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moodverter-real-mini-run-'));
  try {
    const inputPath = path.join(tmpDir, 'real-mini-input.json');
    const outputPath = path.join(tmpDir, 'real-mini-output.json');
    const diagnosticPath = path.join(tmpDir, 'real-mini-diagnostic.json');

    const seedTrackIds = TRACKS.slice(0, REAL_MINI_RUN_SEED_COUNT).map((track) => track.id);
    const allTrackIds = TRACKS.map((track) => track.id);
    const relevantTargetsBySeed = Object.fromEntries(
      seedTrackIds.map((seedTrackId, seedIndex) => {
        const first = allTrackIds[(seedIndex + 1) % allTrackIds.length];
        const second = allTrackIds[(seedIndex + 4) % allTrackIds.length];
        return [seedTrackId, [first, second].filter((targetTrackId) => targetTrackId !== seedTrackId)];
      })
    );

    await fs.writeFile(inputPath, JSON.stringify({
      scopeId: 'quality-real-mini-run-v1',
      runMode: 'real',
      limit: 5,
      goodThreshold: 0.35,
      requiredRelevantTargetsPerSeed: 2,
      runtimeGate: { enforce: false },
      tracks: TRACKS,
      seedTrackIds,
      relevantTargetsBySeed,
    }), 'utf-8');

    await run(process.execPath, [
      CLI_PATH,
      '--input', inputPath,
      '--output', outputPath,
      '--diagnostic-bundle-out', diagnosticPath,
    ]);

    const artifact = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
    const diagnostic = JSON.parse(await fs.readFile(diagnosticPath, 'utf-8'));
    const baselineResult = artifact.baselineResult;

    if (!baselineResult || baselineResult.runMode !== 'real') {
      throw new Error('real mini-run expected runMode=real');
    }
    if (baselineResult.seedCount < REAL_MINI_RUN_SEED_COUNT) {
      throw new Error(`real mini-run expected at least ${REAL_MINI_RUN_SEED_COUNT} seeds`);
    }
    if (baselineResult.relevanceTargetGatePassed !== true) {
      throw new Error('real mini-run expected relevance target gate PASS');
    }
    if (!Array.isArray(diagnostic.diagnostics) || diagnostic.diagnostics.length === 0) {
      throw new Error('real mini-run expected non-empty diagnostic bundle');
    }

    process.stdout.write('[real-mini-run] PASS: quality gate validated in real mode.\n');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  process.stderr.write(`[real-mini-run] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
