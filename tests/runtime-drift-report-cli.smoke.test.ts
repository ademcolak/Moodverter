import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const workspaceRoot = path.resolve(__dirname, '..', '..');
  const cliPath = path.resolve(__dirname, 'runtime-drift-report.cli.js');

  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cliPath, ...args], { cwd: workspaceRoot }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`runtime-drift-report cli failed: ${stderr || error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'moodverter-runtime-drift-cli-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('runtime-drift-report cli writes degrading drift artifact', async () => {
  await withTempDir(async (tmpDir) => {
    const inputPath = path.join(tmpDir, 'runtime-drift-input.json');
    const outputPath = path.join(tmpDir, 'runtime-drift-output.json');

    await fs.writeFile(inputPath, JSON.stringify({
      scopeId: 'runtime-drift-cli-smoke',
      windowSize: 8,
      requireReport: true,
      tracks: [
        { id: 'seed-1', name: 'Seed Track', artist: 'Artist A', durationMs: 180000 },
        { id: 'target-1', name: 'Target 1', artist: 'Artist B', durationMs: 176000 },
        { id: 'target-2', name: 'Target 2', artist: 'Artist C', durationMs: 172000 },
      ],
      seedTrackIds: ['seed-1'],
      relevantTargetsBySeed: {
        'seed-1': ['target-1', 'target-2'],
      },
      runs: [
        {
          events: [
            { sourceTrackId: 'seed-1', targetTrackId: 'target-1', latencyMs: 1000, stalled: false, dropped: false, mode: 'auto' },
            { sourceTrackId: 'seed-1', targetTrackId: 'target-2', latencyMs: 1100, stalled: false, dropped: false, mode: 'auto' },
          ],
        },
        {
          events: [
            { sourceTrackId: 'seed-1', targetTrackId: 'target-1', latencyMs: 2600, stalled: true, dropped: true, mode: 'auto' },
            { sourceTrackId: 'seed-1', targetTrackId: 'target-2', latencyMs: 2500, stalled: true, dropped: true, mode: 'auto' },
          ],
        },
      ],
    }), 'utf-8');

    const execution = await runCli(['--input', inputPath, '--output', outputPath]);
    assert.match(execution.stdout, /\[runtime:drift\] overall=degrading/);

    const artifactRaw = await fs.readFile(outputPath, 'utf-8');
    const artifact = JSON.parse(artifactRaw) as Record<string, unknown>;
    assert.equal(artifact.scopeId, 'runtime-drift-cli-smoke');

    const report = artifact.report as Record<string, unknown>;
    assert.equal(report.overallStatus, 'degrading');
    assert.equal(typeof report.summary, 'string');

    const metrics = report.metrics as Array<Record<string, unknown>>;
    assert.equal(Array.isArray(metrics), true);
    assert.equal(metrics.length, 3);
  });
});
