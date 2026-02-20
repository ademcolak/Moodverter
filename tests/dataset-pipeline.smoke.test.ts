import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function runDatasetPipeline(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const workspaceRoot = path.resolve(__dirname, '..', '..');
  const scriptPath = path.resolve(workspaceRoot, 'scripts/dataset-pipeline.mjs');

  return new Promise((resolve, reject) => {
    execFile(process.execPath, [scriptPath, ...args], { cwd: workspaceRoot }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`dataset-pipeline failed: ${stderr || error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'moodverter-dataset-pipeline-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('dataset pipeline curate-only produces playlist in Moodverter storage format', async () => {
  await withTempDir(async (tmpDir) => {
    const candidatesPath = path.join(tmpDir, 'candidates.json');
    const configPath = path.join(tmpDir, 'config.json');
    const outputDir = path.join(tmpDir, 'output');

    const candidates = [
      {
        videoId: 'a1234567890',
        title: 'Track A',
        artist: 'Artist One',
        thumbnail: 'https://i.ytimg.com/vi/a1234567890/hqdefault.jpg',
        duration: 180000,
        viewCount: 1000,
        sourceQuery: 'query-1',
      },
      {
        videoId: 'b1234567890',
        title: 'Track B',
        artist: 'Artist Two',
        thumbnail: 'https://i.ytimg.com/vi/b1234567890/hqdefault.jpg',
        duration: 190000,
        viewCount: 900,
        sourceQuery: 'query-2',
      },
      {
        videoId: 'c1234567890',
        title: 'Track C',
        artist: 'Artist One',
        thumbnail: 'https://i.ytimg.com/vi/c1234567890/hqdefault.jpg',
        duration: 200000,
        viewCount: 800,
        sourceQuery: 'query-1',
      },
      {
        videoId: 'd1234567890',
        title: 'Track D',
        artist: 'Artist Three',
        thumbnail: 'https://i.ytimg.com/vi/d1234567890/hqdefault.jpg',
        duration: 210000,
        viewCount: 700,
        sourceQuery: 'query-2',
      },
    ];

    await fs.writeFile(candidatesPath, `${JSON.stringify(candidates, null, 2)}\n`, 'utf-8');
    await fs.writeFile(configPath, JSON.stringify({
      targetCount: 3,
      artistMaxTracks: 1,
      minDurationMs: 120000,
      maxDurationMs: 400000,
      queryMaxMultiplier: 3,
      inputCandidates: candidatesPath,
    }), 'utf-8');

    const execution = await runDatasetPipeline([
      '--curate-only',
      '--config', configPath,
      '--input-candidates', candidatesPath,
      '--output-dir', outputDir,
    ]);

    assert.match(execution.stdout, /\[dataset:pipeline\] curated 3\/3 tracks/);

    const playlistRaw = await fs.readFile(path.join(outputDir, 'playlist.moodverter.json'), 'utf-8');
    const playlist = JSON.parse(playlistRaw) as Array<Record<string, unknown>>;

    assert.equal(playlist.length, 3);
    playlist.forEach((track) => {
      assert.equal(typeof track.videoId, 'string');
      assert.equal(typeof track.title, 'string');
      assert.equal(typeof track.artist, 'string');
      assert.equal(typeof track.thumbnail, 'string');
      assert.equal(typeof track.addedAt, 'number');
      assert.ok(track.duration === undefined || typeof track.duration === 'number');
    });

    const reportRaw = await fs.readFile(path.join(outputDir, 'dataset-report.json'), 'utf-8');
    const report = JSON.parse(reportRaw) as Record<string, unknown>;
    assert.equal(report.selectedCount, 3);
    assert.equal(report.targetCount, 3);
  });
});
