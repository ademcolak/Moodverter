import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const workspaceRoot = process.cwd();

async function readWorkspaceFile(relativePath: string): Promise<string> {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf-8');
}

test('qa:auto keeps regression gate in the QA sequence', async () => {
  const source = await readWorkspaceFile('scripts/qa-auto.mjs');

  const smokeTestsIndex = source.indexOf("name: 'Smoke Tests'");
  const regressionGateIndex = source.indexOf("name: 'Regression Gate'");
  const benchmarkMergeGateIndex = source.indexOf("name: 'Benchmark Merge Gate'");

  assert.ok(smokeTestsIndex >= 0, 'Smoke Tests step must exist in qa:auto');
  assert.ok(regressionGateIndex >= 0, 'Regression Gate step must exist in qa:auto');
  assert.ok(benchmarkMergeGateIndex >= 0, 'Benchmark Merge Gate step must exist in qa:auto');
  assert.ok(regressionGateIndex > smokeTestsIndex, 'Regression Gate should run after Smoke Tests');
  assert.ok(
    benchmarkMergeGateIndex > regressionGateIndex,
    'Benchmark Merge Gate should run after Regression Gate'
  );
  assert.match(source, /args:\s*\['run', 'smoke:regression-gate'\]/);
  assert.match(source, /args:\s*\['run', 'smoke:benchmark-merge-gate'\]/);
});

test('pipeline:quality keeps required quality guard steps', async () => {
  const source = await readWorkspaceFile('scripts/quality-pipeline.mjs');

  const stepNames = [
    'QA Auto',
    'OSS Guard',
    'Retrieval Gate',
    'Transition Gating',
    'Transition Decision',
    'Decision Matrix',
    'Feedback Blacklist',
    'Tuning Dry Run',
    'Tuning Assistant',
    'Real Mini Run',
    'Before/After Report',
  ];
  const stepIndexes = stepNames.map((stepName) => source.indexOf(`name: '${stepName}'`));

  stepIndexes.forEach((index, i) => {
    assert.ok(index >= 0, `${stepNames[i]} step must exist in pipeline:quality`);
  });

  for (let i = 1; i < stepIndexes.length; i += 1) {
    assert.ok(stepIndexes[i] > stepIndexes[i - 1], 'pipeline:quality step order should remain stable');
  }

  assert.match(source, /args:\s*\['run', 'oss:guard'\]/);
  assert.match(source, /args:\s*\['run', 'smoke:retrieval-gate'\]/);
  assert.match(source, /args:\s*\['run', 'smoke:transition-gating'\]/);
  assert.match(source, /args:\s*\['run', 'smoke:transition-decision'\]/);
  assert.match(source, /args:\s*\['run', 'smoke:decision-matrix'\]/);
  assert.match(source, /args:\s*\['run', 'smoke:feedback-blacklist'\]/);
  assert.match(source, /args:\s*\['run', 'smoke:tuning-loop-dry-run'\]/);
  assert.match(source, /args:\s*\['run', 'smoke:tuning-assistant'\]/);
  assert.match(source, /args:\s*\['run', 'smoke:real-mini-run'\]/);
  assert.match(source, /args:\s*\['run', 'smoke:benchmark-before-after-report'\]/);
});

test('repo config keeps smoke artifact ignored and quality scripts published', async () => {
  const [gitignoreSource, packageJsonSource] = await Promise.all([
    readWorkspaceFile('.gitignore'),
    readWorkspaceFile('package.json'),
  ]);

  assert.match(gitignoreSource, /^\.smoke-dist$/m);

  const packageJson = JSON.parse(packageJsonSource) as {
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};

  assert.equal(typeof scripts['pipeline:quality'], 'string');
  assert.equal(typeof scripts['qa:auto'], 'string');
  assert.equal(typeof scripts['oss:guard'], 'string');
  assert.equal(scripts['clean:artifacts'], 'node scripts/clean-artifacts.mjs');
  assert.equal(scripts['smoke:compile'], 'node scripts/smoke-compile.mjs');
  assert.equal(typeof scripts['smoke:regression-gate'], 'string');
  assert.equal(typeof scripts['smoke:benchmark-merge-gate'], 'string');
  assert.equal(typeof scripts['smoke:transition-gating'], 'string');
  assert.equal(typeof scripts['smoke:transition-decision'], 'string');
  assert.equal(typeof scripts['smoke:decision-matrix'], 'string');
  assert.equal(typeof scripts['smoke:feedback-blacklist'], 'string');
  assert.equal(typeof scripts['smoke:tuning-assistant'], 'string');
  assert.equal(typeof scripts['tuning:assistant'], 'string');
  assert.equal(typeof scripts['smoke:real-mini-run'], 'string');
  assert.equal(typeof scripts['smoke:benchmark-before-after-report'], 'string');
});
