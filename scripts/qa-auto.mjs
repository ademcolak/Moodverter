#!/usr/bin/env node

import { spawn } from 'node:child_process';

const stepDefinitions = [
  { name: 'Lint', command: 'pnpm', args: ['run', 'lint'] },
  { name: 'Typecheck', command: 'pnpm', args: ['run', 'typecheck'] },
  { name: 'Build', command: 'pnpm', args: ['run', 'build'] },
  { name: 'Smoke Tests', command: 'pnpm', args: ['run', 'smoke:test'] },
  { name: 'Regression Gate', command: 'pnpm', args: ['run', 'smoke:regression-gate'] },
  { name: 'Benchmark Merge Gate', command: 'pnpm', args: ['run', 'smoke:benchmark-merge-gate'] },
  { name: 'Decision Matrix', command: 'pnpm', args: ['run', 'smoke:decision-matrix'] },
  { name: 'Feedback Blacklist', command: 'pnpm', args: ['run', 'smoke:feedback-blacklist'] },
];

function runStep(step) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(step.command, step.args, {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code) => {
      const durationMs = Date.now() - startedAt;
      if (code === 0) {
        resolve(durationMs);
        return;
      }
      reject(new Error(`${step.name} failed (exit code ${code ?? 'unknown'})`));
    });
  });
}

async function main() {
  const results = [];
  const startedAt = Date.now();

  for (const step of stepDefinitions) {
    process.stdout.write(`\n[qa:auto] ${step.name}...\n`);
    const durationMs = await runStep(step);
    results.push({ name: step.name, durationMs });
    process.stdout.write(`[qa:auto] ${step.name} OK (${(durationMs / 1000).toFixed(1)}s)\n`);
  }

  const totalDurationMs = Date.now() - startedAt;
  process.stdout.write('\n[qa:auto] Summary\n');
  results.forEach((result) => {
    process.stdout.write(`- ${result.name}: ${(result.durationMs / 1000).toFixed(1)}s\n`);
  });
  process.stdout.write(`[qa:auto] Total: ${(totalDurationMs / 1000).toFixed(1)}s\n`);
}

main().catch((error) => {
  process.stderr.write(`\n[qa:auto] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
