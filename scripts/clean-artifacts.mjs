#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const artifactPaths = [
  'dist',
  '.smoke-dist',
  path.join('src-tauri', 'target'),
  path.join('node_modules', '.vite'),
];

async function main() {
  for (const artifactPath of artifactPaths) {
    await fs.rm(path.join(projectRoot, artifactPath), {
      recursive: true,
      force: true,
    });
  }
}

main().catch((error) => {
  process.stderr.write(`[clean:artifacts] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
