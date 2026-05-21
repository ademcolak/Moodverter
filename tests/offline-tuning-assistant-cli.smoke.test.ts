import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const workspaceRoot = path.resolve(__dirname, '..', '..');
  const cliPath = path.resolve(__dirname, 'offline-tuning-assistant.cli.js');

  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cliPath, ...args], { cwd: workspaceRoot }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`offline tuning assistant cli failed: ${stderr || error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'moodverter-tuning-assistant-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('offline tuning assistant writes bottom-seed recommendation artifact', async () => {
  await withTempDir(async (tmpDir) => {
    const inputPath = path.join(tmpDir, 'tuning-loop-artifact.json');
    const diagnosticPath = path.join(tmpDir, 'diagnostic-bundle.json');
    const outputPath = path.join(tmpDir, 'assistant-output.json');

    await fs.writeFile(inputPath, JSON.stringify({
      mode: 'single',
      baselineResult: {
        scopeId: 'assistant-smoke',
        seedSetHash: 'fnv1a32:test',
        runMode: 'synthetic',
        scoringVersion: 'v2',
        analysisVersion: 2,
        runAt: '2026-02-20T00:00:00.000Z',
        hitAt3: 0.67,
        hitAt5: 1,
        meanTopKScore: 0.58,
        coverageRate: 0.9,
        labeledSeedCount: 3,
        regressionDetected: false,
        regressionSummary: null,
        regressionGatePassed: true,
        runtimeGatePassed: true,
        runtimeGateSummary: 'ok',
        tuningValidationPassed: true,
        tuningValidationSummary: 'quality improved without gate degradation',
        benchmarkMergeGatePassed: true,
        bottomSeeds: [{
          trackId: 'seed-a',
          top1Score: 0.42,
          meanTopKScore: 0.38,
          hitAt3: 0,
          hitAt5: 1,
          averageEventMatchScore: 0.31,
          averageEmbeddingSimilarity: 0.64,
          averageTempoRatioScore: 0.71,
          averageHarmonicCompatibilityScore: 0.61,
          averageRhythmAlignmentScore: 0.66,
          averageLoudnessContinuityScore: 0.72,
          averageSmoothnessScore: 0.69,
          averageArtifactPenalty: 0.22,
          dominantDriver: 'event',
        }],
        tuningActions: [{
          trackId: 'seed-a',
          issue: 'event',
          recommendation: 'Event taxonomy alignment denenmeli.',
          confidence: 0.82,
          priority: 'normal',
          escalationReason: null,
          gateFailDistribution: [{ reason: 'EVENT_MISMATCH', count: 2, rate: 0.5 }],
        }],
      },
    }), 'utf-8');

    await fs.writeFile(diagnosticPath, JSON.stringify({
      diagnostics: [{
        trackId: 'seed-a',
        candidateBreakdown: [{
          targetTrackId: 'target-a',
          targetTimeMs: 64000,
          finalScore: 0.42,
          smoothnessScore: 0.62,
          dominantDriver: 'event',
          explainTopReasons: ['event weak'],
          gateStatus: 'fail',
          skipReason: 'EVENT_MISMATCH',
        }],
      }],
    }), 'utf-8');

    const execution = await runCli([
      '--input',
      inputPath,
      '--diagnostic-bundle',
      diagnosticPath,
      '--output',
      outputPath,
    ]);
    assert.match(execution.stdout, /\[offline:tuning-assistant\] artifact written:/);

    const artifactRaw = await fs.readFile(outputPath, 'utf-8');
    const artifact = JSON.parse(artifactRaw) as Record<string, unknown>;
    assert.equal(artifact.schemaVersion, 1);

    const runIdentity = artifact.runIdentity as Record<string, unknown>;
    assert.equal(runIdentity.scopeId, 'assistant-smoke');
    assert.equal(runIdentity.seedSetHash, 'fnv1a32:test');

    const bottomSeedDiagnostics = artifact.bottomSeedDiagnostics as Array<Record<string, unknown>>;
    assert.equal(bottomSeedDiagnostics.length, 1);
    assert.equal(bottomSeedDiagnostics[0].trackId, 'seed-a');
    assert.equal(bottomSeedDiagnostics[0].risk, 'medium');

    const proposedActions = artifact.proposedActions as Array<Record<string, unknown>>;
    assert.equal(proposedActions.length, 1);
    assert.equal(proposedActions[0].type, 'weight_change');
    assert.equal(proposedActions[0].target, 'event');

    const acceptanceCriteria = artifact.acceptanceCriteria as Record<string, unknown>;
    assert.equal(acceptanceCriteria.requiredCommand, 'pnpm run pipeline:quality');
  });
});
