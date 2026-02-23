#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';

const DEFAULT_CONFIG_PATH = './configs/dataset-pipeline.example.json';

function parseArgs(argv) {
  const options = {
    web: false,
    configPath: DEFAULT_CONFIG_PATH,
    outputDir: null,
    appArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--web') {
      options.web = true;
      continue;
    }

    if (token === '--config' && next) {
      options.configPath = next.trim();
      index += 1;
      continue;
    }

    if (token === '--output-dir' && next) {
      options.outputDir = next.trim();
      index += 1;
      continue;
    }

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (token === '--') {
      options.appArgs = argv.slice(index + 1);
      break;
    }
  }

  return options;
}

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
      reject(new Error(`${command} ${args.join(' ')} failed (exit code ${code ?? 'unknown'})`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(
      [
        'Kullanim:',
        '  pnpm run dev:with-dataset [-- --config <path>] [--output-dir <path>] [-- <app-args>]',
        '  pnpm run dev:web:with-dataset [-- --config <path>] [--output-dir <path>] [-- <vite-args>]',
        '',
        'Ornek:',
        '  pnpm run dev:with-dataset',
        '  pnpm run dev:with-dataset -- --config ./configs/dataset-pipeline.example.json',
        '  pnpm run dev:web:with-dataset -- -- --host',
        '',
      ].join('\n')
    );
    return;
  }

  const datasetArgs = ['run', 'dataset:pipeline', '--', '--config', options.configPath];
  if (options.outputDir) {
    datasetArgs.push('--output-dir', options.outputDir);
  }

  process.stdout.write(`[dev:with-dataset] dataset uretiliyor (config=${path.normalize(options.configPath)})...\n`);
  await run('pnpm', datasetArgs);
  process.stdout.write('[dev:with-dataset] dataset tamam. Uygulama baslatiliyor...\n');

  const appCommandArgs = options.web
    ? ['run', 'dev', ...options.appArgs]
    : ['tauri', 'dev', ...options.appArgs];

  const child = spawn('pnpm', appCommandArgs, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  child.on('error', (error) => {
    process.stderr.write(`[dev:with-dataset] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });

  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}

main().catch((error) => {
  process.stderr.write(`[dev:with-dataset] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
