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

  assert.ok(smokeTestsIndex >= 0, 'Smoke Tests step must exist in qa:auto');
  assert.ok(regressionGateIndex >= 0, 'Regression Gate step must exist in qa:auto');
  assert.ok(regressionGateIndex > smokeTestsIndex, 'Regression Gate should run after Smoke Tests');
  assert.match(source, /args:\s*\['run', 'smoke:regression-gate'\]/);
});

test('pipeline:quality keeps required quality guard steps', async () => {
  const source = await readWorkspaceFile('scripts/quality-pipeline.mjs');

  const stepNames = ['QA Auto', 'OSS Guard', 'Retrieval Gate', 'Tuning Dry Run'];
  const stepIndexes = stepNames.map((stepName) => source.indexOf(`name: '${stepName}'`));

  stepIndexes.forEach((index, i) => {
    assert.ok(index >= 0, `${stepNames[i]} step must exist in pipeline:quality`);
  });

  for (let i = 1; i < stepIndexes.length; i += 1) {
    assert.ok(stepIndexes[i] > stepIndexes[i - 1], 'pipeline:quality step order should remain stable');
  }

  assert.match(source, /args:\s*\['run', 'oss:guard'\]/);
  assert.match(source, /args:\s*\['run', 'smoke:retrieval-gate'\]/);
  assert.match(source, /args:\s*\['run', 'smoke:tuning-loop-dry-run'\]/);
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
  assert.equal(typeof scripts['smoke:regression-gate'], 'string');
});
