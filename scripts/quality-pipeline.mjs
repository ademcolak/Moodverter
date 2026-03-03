#!/usr/bin/env node

import { spawn } from 'node:child_process';

const stepDefinitions = [
  { name: 'QA Auto', command: 'pnpm', args: ['run', 'qa:auto'] },
  { name: 'OSS Guard', command: 'pnpm', args: ['run', 'oss:guard'] },
  { name: 'Retrieval Gate', command: 'pnpm', args: ['run', 'smoke:retrieval-gate'] },
  { name: 'Transition Gating', command: 'pnpm', args: ['run', 'smoke:transition-gating'] },
  { name: 'Transition Decision', command: 'pnpm', args: ['run', 'smoke:transition-decision'] },
  { name: 'Tuning Dry Run', command: 'pnpm', args: ['run', 'smoke:tuning-loop-dry-run'] },
  { name: 'Real Mini Run', command: 'pnpm', args: ['run', 'smoke:real-mini-run'] },
  { name: 'Before/After Report', command: 'pnpm', args: ['run', 'smoke:benchmark-before-after-report'] },
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
    process.stdout.write(`\n[pipeline:quality] ${step.name}...\n`);
    const durationMs = await runStep(step);
    results.push({ name: step.name, durationMs });
    process.stdout.write(`[pipeline:quality] ${step.name} OK (${(durationMs / 1000).toFixed(1)}s)\n`);
  }

  const totalDurationMs = Date.now() - startedAt;
  process.stdout.write('\n[pipeline:quality] Summary\n');
  results.forEach((result) => {
    process.stdout.write(`- ${result.name}: ${(result.durationMs / 1000).toFixed(1)}s\n`);
  });
  process.stdout.write(`[pipeline:quality] Total: ${(totalDurationMs / 1000).toFixed(1)}s\n`);
}

main().catch((error) => {
  process.stderr.write(`\n[pipeline:quality] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
