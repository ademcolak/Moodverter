#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const smokeDistPath = path.join(projectRoot, '.smoke-dist');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

async function main() {
  await fs.rm(smokeDistPath, {
    recursive: true,
    force: true,
  });
  run('tsc', ['-p', 'tsconfig.smoke.json']);
  await fs.writeFile(
    path.join(smokeDistPath, 'package.json'),
    `${JSON.stringify({ type: 'commonjs' })}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`[smoke:compile] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
