import fs from 'node:fs/promises';
import path from 'node:path';

const REGISTRY_PATH = path.resolve(process.cwd(), 'docs/oss/source-registry.json');

const ALLOWED_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MPL-2.0',
  'Unlicense',
]);

const BLOCKED_LICENSES = new Set([
  'GPL-3.0',
  'AGPL-3.0',
  'LGPL-3.0',
  'CC-BY-NC-4.0',
  'CC-BY-NC-SA-4.0',
]);

function fail(message) {
  console.error(`[oss:guard] FAIL: ${message}`);
  process.exitCode = 1;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function main() {
  let raw;
  try {
    raw = await fs.readFile(REGISTRY_PATH, 'utf-8');
  } catch (error) {
    fail(`Registry okunamadi: ${REGISTRY_PATH}`);
    return;
  }

  let entries;
  try {
    entries = JSON.parse(raw);
  } catch (error) {
    fail('Registry JSON parse edilemedi.');
    return;
  }

  if (!Array.isArray(entries)) {
    fail('Registry root array olmali.');
    return;
  }

  const warnings = [];
  const errors = [];

  entries.forEach((entry, index) => {
    const label = `entry[${index}]`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${label} object olmali.`);
      return;
    }

    const name = isNonEmptyString(entry.name) ? entry.name.trim() : '';
    const url = isNonEmptyString(entry.url) ? entry.url.trim() : '';
    const license = isNonEmptyString(entry.licenseSpdx) ? entry.licenseSpdx.trim() : '';
    const usage = isNonEmptyString(entry.usage) ? entry.usage.trim() : '';
    const approvedException = entry.approvedException === true;

    if (!name) errors.push(`${label} name zorunlu.`);
    if (!url) errors.push(`${label} url zorunlu.`);
    if (!license) errors.push(`${label} licenseSpdx zorunlu.`);
    if (!usage) errors.push(`${label} usage zorunlu.`);

    if (!license) return;

    if (BLOCKED_LICENSES.has(license) && !approvedException) {
      errors.push(`${label} (${name || 'unknown'}) blocked lisans kullaniyor: ${license}`);
      return;
    }

    if (!ALLOWED_LICENSES.has(license) && !approvedException) {
      warnings.push(`${label} (${name || 'unknown'}) allowlist disi lisans: ${license}. approvedException gerekli olabilir.`);
    }
  });

  warnings.forEach((warning) => {
    console.warn(`[oss:guard] WARN: ${warning}`);
  });

  if (errors.length > 0) {
    errors.forEach((error) => fail(error));
    return;
  }

  console.log(`[oss:guard] PASS: ${entries.length} kaynak kaydi kontrol edildi.`);
}

void main();
