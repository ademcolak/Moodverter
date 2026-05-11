#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = process.cwd();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
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

function runPackageScript(scriptName) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    if (npmExecPath.endsWith('.cmd') || npmExecPath.endsWith('.bat')) {
      run(npmExecPath, ['run', scriptName]);
      return;
    }
    run(process.execPath, [npmExecPath, 'run', scriptName]);
    return;
  }
  run('pnpm', ['run', scriptName]);
}

try {
  runPackageScript('clean:artifacts');
  runPackageScript('build');
  run('cargo', ['check'], {
    cwd: path.join(projectRoot, 'src-tauri'),
  });
} catch (error) {
  process.stderr.write(`[rebuild:full] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
