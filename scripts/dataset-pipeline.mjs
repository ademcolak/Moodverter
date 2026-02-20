#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_OUTPUT_DIR = 'dataset/output';
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_REQUEST_DELAY_MS = 150;
const DEFAULT_PER_QUERY_LIMIT = 20;
const DEFAULT_TARGET_COUNT = 1000;
const DEFAULT_ARTIST_MAX_TRACKS = 2;
const DEFAULT_MIN_DURATION_MS = 90_000;
const DEFAULT_MAX_DURATION_MS = 480_000;
const DEFAULT_QUERY_MAX_MULTIPLIER = 2.5;
const DEFAULT_ENDPOINTS = [
  'https://piped.video/api/v1/search',
  'https://pipedapi.kavin.rocks/search',
  'https://pipedapi.adminforge.de/search',
  'https://pipedapi.ducks.party/search',
];

function parseArgs(argv) {
  const options = {
    configPath: null,
    outputDir: null,
    inputCandidatesPath: null,
    collectOnly: false,
    curateOnly: false,
    targetCountOverride: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

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
    if (token === '--input-candidates' && next) {
      options.inputCandidatesPath = next.trim();
      index += 1;
      continue;
    }
    if (token === '--target' && next) {
      const parsed = Number.parseInt(next, 10);
      options.targetCountOverride = Number.isFinite(parsed) ? parsed : null;
      index += 1;
      continue;
    }
    if (token === '--collect-only') {
      options.collectOnly = true;
      continue;
    }
    if (token === '--curate-only') {
      options.curateOnly = true;
      continue;
    }
  }

  return options;
}

async function loadJsonFile(filePath, label) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(absolutePath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} JSON parse edilemedi: ${absolutePath}`);
  }
}

function toFiniteNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function extractYouTubeVideoId(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    if (hostname.includes('youtube.com')) {
      const id = url.searchParams.get('v');
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
    }
    if (hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) {
      const id = url.pathname.replace(/\//g, '');
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeArtist(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return 'unknown-artist';
  return raw
    .replace(/\s+feat\.?\s+.*$/i, '')
    .replace(/\s+ft\.?\s+.*$/i, '')
    .replace(/\s+official.*$/i, '')
    .replace(/\s+lyrics?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\(official.*?\)/gi, '')
    .replace(/\[official.*?\]/gi, '')
    .replace(/\(lyrics?\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function mapPublicResult(item, query, endpoint) {
  if (!item || typeof item !== 'object') return null;
  const row = item;
  const normalizedUrl = typeof row.url === 'string'
    ? (row.url.startsWith('http') ? row.url : `https://youtube.com${row.url}`)
    : null;
  const urlVideoId = normalizedUrl ? extractYouTubeVideoId(normalizedUrl) : null;
  const directVideoId = typeof row.id === 'string' ? extractYouTubeVideoId(row.id) : null;
  const videoId = directVideoId ?? urlVideoId;
  if (!videoId) return null;

  const title = typeof row.title === 'string' ? row.title.trim() : '';
  if (!title) return null;

  const artist = typeof row.uploaderName === 'string'
    ? row.uploaderName
    : typeof row.uploader === 'string'
      ? row.uploader
      : 'Unknown Artist';

  const durationSec = toFiniteNumber(row.duration);
  const viewCount = toFiniteNumber(row.views);
  const thumbnail = typeof row.thumbnail === 'string' && row.thumbnail.length > 0
    ? row.thumbnail
    : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    videoId,
    title,
    artist,
    thumbnail,
    duration: durationSec === null ? null : Math.max(0, Math.floor(durationSec * 1000)),
    viewCount: viewCount === null ? null : Math.max(0, Math.floor(viewCount)),
    sourceQuery: query,
    sourceEndpoint: endpoint,
    fetchedAt: new Date().toISOString(),
  };
}

async function searchSingleEndpoint(endpoint, query, limit, timeoutMs) {
  const boundedLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const url = `${endpoint}?q=${encodeURIComponent(query)}&filter=videos`;
  const payload = await fetchJsonWithTimeout(url, timeoutMs);
  if (!Array.isArray(payload)) return [];

  const mapped = payload
    .map((item) => mapPublicResult(item, query, endpoint))
    .filter((item) => item !== null);

  const seen = new Set();
  const deduped = [];
  for (const candidate of mapped) {
    if (seen.has(candidate.videoId)) continue;
    seen.add(candidate.videoId);
    deduped.push(candidate);
    if (deduped.length >= boundedLimit) break;
  }
  return deduped;
}

async function searchQueryAcrossEndpoints(config, query) {
  for (const endpoint of config.endpoints) {
    const result = await searchSingleEndpoint(
      endpoint,
      query,
      config.perQueryLimit,
      config.timeoutMs
    );
    if (result.length > 0) return result;
  }
  return [];
}

function dedupeCandidates(candidates) {
  const byVideoId = new Map();

  for (const candidate of candidates) {
    const existing = byVideoId.get(candidate.videoId);
    if (!existing) {
      byVideoId.set(candidate.videoId, candidate);
      continue;
    }

    const existingViews = existing.viewCount ?? -1;
    const nextViews = candidate.viewCount ?? -1;
    if (nextViews > existingViews) {
      byVideoId.set(candidate.videoId, candidate);
    }
  }

  return [...byVideoId.values()];
}

function curateDiversePlaylist(candidates, config) {
  const targetCount = Math.max(1, Math.floor(config.targetCount));
  const artistMaxTracks = Math.max(1, Math.floor(config.artistMaxTracks));
  const minDurationMs = Math.max(0, Math.floor(config.minDurationMs));
  const maxDurationMs = Math.max(minDurationMs, Math.floor(config.maxDurationMs));
  const queryMaxMultiplier = Math.max(1, Number(config.queryMaxMultiplier) || DEFAULT_QUERY_MAX_MULTIPLIER);

  const filtered = dedupeCandidates(candidates)
    .filter((candidate) => {
      const duration = candidate.duration;
      if (duration === null || duration === undefined) return true;
      return duration >= minDurationMs && duration <= maxDurationMs;
    });

  const queries = Array.from(new Set(filtered.map((candidate) => candidate.sourceQuery || 'unknown-query')));
  const perQueryCap = Math.max(1, Math.ceil((targetCount / Math.max(1, queries.length)) * queryMaxMultiplier));

  const byQuery = new Map();
  for (const query of queries) {
    byQuery.set(query, []);
  }

  filtered
    .sort((a, b) => {
      const aViews = a.viewCount ?? -1;
      const bViews = b.viewCount ?? -1;
      if (bViews !== aViews) return bViews - aViews;
      return a.title.localeCompare(b.title);
    })
    .forEach((candidate) => {
      const query = candidate.sourceQuery || 'unknown-query';
      if (!byQuery.has(query)) {
        byQuery.set(query, []);
      }
      byQuery.get(query).push(candidate);
    });

  const selected = [];
  const selectedVideoIds = new Set();
  const selectedTitleKeys = new Set();
  const artistCount = new Map();
  const queryCount = new Map();

  const queryList = [...byQuery.keys()];

  const trySelectFromBucket = (bucket, query, relaxed = false) => {
    while (bucket.length > 0) {
      const candidate = bucket.shift();
      const artistKey = normalizeArtist(candidate.artist);
      const titleKey = `${artistKey}::${normalizeTitle(candidate.title)}`;
      const currentArtistCount = artistCount.get(artistKey) ?? 0;
      const currentQueryCount = queryCount.get(query) ?? 0;

      if (selectedVideoIds.has(candidate.videoId)) continue;
      if (selectedTitleKeys.has(titleKey)) continue;
      if (!relaxed && currentArtistCount >= artistMaxTracks) continue;
      if (!relaxed && currentQueryCount >= perQueryCap) continue;

      selected.push(candidate);
      selectedVideoIds.add(candidate.videoId);
      selectedTitleKeys.add(titleKey);
      artistCount.set(artistKey, currentArtistCount + 1);
      queryCount.set(query, currentQueryCount + 1);
      return true;
    }
    return false;
  };

  let pickedInRound = true;
  while (selected.length < targetCount && pickedInRound) {
    pickedInRound = false;
    for (const query of queryList) {
      const bucket = byQuery.get(query) ?? [];
      const picked = trySelectFromBucket(bucket, query, false);
      if (picked) pickedInRound = true;
      if (selected.length >= targetCount) break;
    }
  }

  if (selected.length < targetCount) {
    for (const query of queryList) {
      if (selected.length >= targetCount) break;
      const bucket = byQuery.get(query) ?? [];
      while (selected.length < targetCount && trySelectFromBucket(bucket, query, true)) {
        // relaxed pass
      }
    }
  }

  const playlist = selected.slice(0, targetCount).map((candidate, index) => ({
    videoId: candidate.videoId,
    title: candidate.title,
    artist: candidate.artist,
    thumbnail: candidate.thumbnail,
    duration: candidate.duration ?? undefined,
    addedAt: Date.now() + index,
  }));

  return {
    playlist,
    report: {
      targetCount,
      selectedCount: playlist.length,
      candidateCount: candidates.length,
      filteredCandidateCount: filtered.length,
      uniqueArtists: new Set(playlist.map((track) => normalizeArtist(track.artist))).size,
      uniqueQueries: new Set(selected.map((item) => item.sourceQuery || 'unknown-query')).size,
      constraints: {
        artistMaxTracks,
        minDurationMs,
        maxDurationMs,
        perQueryCap,
      },
    },
  };
}

async function loadConfig(configPath) {
  if (!configPath) return {};
  const raw = await loadJsonFile(configPath, 'Config');
  if (!raw || typeof raw !== 'object') {
    throw new Error('Config object olmali.');
  }
  return raw;
}

function resolveConfig(baseConfig, options) {
  const queries = Array.isArray(baseConfig.queries)
    ? baseConfig.queries.map((item) => String(item).trim()).filter((item) => item.length > 0)
    : [];

  return {
    queries,
    endpoints: Array.isArray(baseConfig.endpoints) && baseConfig.endpoints.length > 0
      ? baseConfig.endpoints.map((item) => String(item).trim()).filter((item) => item.length > 0)
      : DEFAULT_ENDPOINTS,
    timeoutMs: Math.max(500, Math.floor(baseConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS)),
    requestDelayMs: Math.max(0, Math.floor(baseConfig.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS)),
    perQueryLimit: Math.max(1, Math.floor(baseConfig.perQueryLimit ?? DEFAULT_PER_QUERY_LIMIT)),
    targetCount: Math.max(1, Math.floor(options.targetCountOverride ?? baseConfig.targetCount ?? DEFAULT_TARGET_COUNT)),
    artistMaxTracks: Math.max(1, Math.floor(baseConfig.artistMaxTracks ?? DEFAULT_ARTIST_MAX_TRACKS)),
    minDurationMs: Math.max(0, Math.floor(baseConfig.minDurationMs ?? DEFAULT_MIN_DURATION_MS)),
    maxDurationMs: Math.max(0, Math.floor(baseConfig.maxDurationMs ?? DEFAULT_MAX_DURATION_MS)),
    queryMaxMultiplier: Number(baseConfig.queryMaxMultiplier ?? DEFAULT_QUERY_MAX_MULTIPLIER),
  };
}

async function collectCandidates(config) {
  if (config.queries.length === 0) {
    throw new Error('Collect icin config.queries zorunlu.');
  }

  const all = [];
  for (let index = 0; index < config.queries.length; index += 1) {
    const query = config.queries[index];
    const results = await searchQueryAcrossEndpoints(config, query);
    process.stdout.write(`[dataset:pipeline] collect ${index + 1}/${config.queries.length} query="${query}" results=${results.length}\n`);
    all.push(...results);
    if (config.requestDelayMs > 0 && index < config.queries.length - 1) {
      await sleep(config.requestDelayMs);
    }
  }

  const deduped = dedupeCandidates(all);
  process.stdout.write(`[dataset:pipeline] collected candidates=${all.length} deduped=${deduped.length}\n`);
  return deduped;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.collectOnly && options.curateOnly) {
    throw new Error('--collect-only ve --curate-only birlikte kullanilamaz.');
  }

  const baseConfig = await loadConfig(options.configPath);
  const config = resolveConfig(baseConfig, options);
  const outputDir = path.resolve(process.cwd(), options.outputDir ?? baseConfig.outputDir ?? DEFAULT_OUTPUT_DIR);
  await ensureDir(outputDir);

  let candidates = [];
  const canCollect = !options.curateOnly;
  const canCurate = !options.collectOnly;

  if (canCollect) {
    candidates = await collectCandidates(config);
    await writeJson(path.join(outputDir, 'candidates.raw.json'), candidates);
  }

  if (!canCollect) {
    const inputPath = options.inputCandidatesPath ?? baseConfig.inputCandidates;
    if (!inputPath) {
      throw new Error('Curate-only icin --input-candidates veya config.inputCandidates gerekli.');
    }
    const rawCandidates = await loadJsonFile(inputPath, 'Candidates');
    if (!Array.isArray(rawCandidates)) {
      throw new Error('Candidates dosyasi array olmali.');
    }
    candidates = rawCandidates;
  }

  if (!canCurate) {
    const collectReport = {
      generatedAt: new Date().toISOString(),
      mode: 'collect-only',
      targetCount: config.targetCount,
      candidateCount: candidates.length,
    };
    await writeJson(path.join(outputDir, 'dataset-report.json'), collectReport);
    process.stdout.write(`[dataset:pipeline] collect-only tamamlandi. output=${outputDir}\n`);
    return;
  }

  const curated = curateDiversePlaylist(candidates, config);
  await writeJson(path.join(outputDir, 'playlist.moodverter.json'), curated.playlist);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: canCollect ? 'collect+curate' : 'curate-only',
    ...curated.report,
  };
  await writeJson(path.join(outputDir, 'dataset-report.json'), report);

  process.stdout.write(`[dataset:pipeline] curated ${curated.playlist.length}/${config.targetCount} tracks. output=${outputDir}\n`);
}

void main().catch((error) => {
  process.stderr.write(`[dataset:pipeline] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
