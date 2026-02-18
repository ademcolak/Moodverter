"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVideoInfo = getVideoInfo;
exports.getPlaylist = getPlaylist;
exports.addToPlaylist = addToPlaylist;
exports.updatePlaylistTrack = updatePlaylistTrack;
exports.removeFromPlaylist = removeFromPlaylist;
exports.addToRecentlyPlayed = addToRecentlyPlayed;
exports.addToSearchHistory = addToSearchHistory;
exports.getSearchSuggestions = getSearchSuggestions;
exports.clearYouTubeLocalData = clearYouTubeLocalData;
exports.searchVideos = searchVideos;
exports.searchResultToUnifiedTrack = searchResultToUnifiedTrack;
const ytdlp_1 = require("./ytdlp");
const PLAYLIST_KEY = 'moodverter_youtube_playlist';
const RECENT_KEY = 'moodverter_youtube_recent';
const SEARCH_HISTORY_KEY = 'moodverter_youtube_search_history';
const MAX_RECENT = 20;
const MAX_SEARCH_HISTORY = 10;
const SEARCH_CACHE_TTL_MS = 60000;
const PUBLIC_SEARCH_TIMEOUT_MS = 2500;
const YTDLP_CIRCUIT_OPEN_MS = 120000;
const PUBLIC_SEARCH_ENDPOINTS = [
    'https://piped.video/api/v1/search',
    'https://pipedapi.kavin.rocks/search',
    'https://pipedapi.adminforge.de/search',
    'https://pipedapi.ducks.party/search',
];
const searchCache = new Map();
let ytdlpCircuitOpenUntil = 0;
async function getVideoInfo(videoId) {
    try {
        const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const response = await fetch(oEmbedUrl);
        if (!response.ok)
            return null;
        const data = await response.json();
        const titleParts = data.title.split(' - ');
        const artist = titleParts.length > 1 ? titleParts[0].trim() : data.author_name;
        const title = titleParts.length > 1 ? titleParts.slice(1).join(' - ').trim() : data.title;
        return {
            videoId,
            title,
            artist,
            thumbnail: data.thumbnail_url,
        };
    }
    catch (error) {
        console.error('Failed to fetch video info:', error);
        return null;
    }
}
function getPlaylist() {
    try {
        const stored = localStorage.getItem(PLAYLIST_KEY);
        if (!stored)
            return [];
        return JSON.parse(stored);
    }
    catch {
        return [];
    }
}
function addToPlaylist(track) {
    const playlist = getPlaylist();
    if (playlist.some((item) => item.videoId === track.videoId))
        return;
    playlist.push({
        ...track,
        addedAt: track.addedAt ?? Date.now(),
    });
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist));
}
function updatePlaylistTrack(videoId, patch) {
    const playlist = getPlaylist();
    let updated = false;
    const nextPlaylist = playlist.map((item) => {
        if (item.videoId !== videoId)
            return item;
        updated = true;
        return {
            ...item,
            ...patch,
        };
    });
    if (updated) {
        localStorage.setItem(PLAYLIST_KEY, JSON.stringify(nextPlaylist));
    }
}
function removeFromPlaylist(videoId) {
    const playlist = getPlaylist();
    const filtered = playlist.filter((item) => item.videoId !== videoId);
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(filtered));
}
function addToRecentlyPlayed(track) {
    let recent = [];
    try {
        const stored = localStorage.getItem(RECENT_KEY);
        recent = stored ? JSON.parse(stored) : [];
    }
    catch {
        recent = [];
    }
    const filtered = recent.filter((item) => item.videoId !== track.videoId);
    filtered.unshift({ ...track, addedAt: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
}
function addToSearchHistory(query) {
    const normalized = query.trim();
    if (!normalized)
        return;
    let history = [];
    try {
        const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
        history = stored ? JSON.parse(stored) : [];
    }
    catch {
        history = [];
    }
    const filtered = history.filter((item) => item.toLowerCase() !== normalized.toLowerCase());
    filtered.unshift(normalized);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filtered.slice(0, MAX_SEARCH_HISTORY)));
}
function getSearchSuggestions(limit = 5) {
    try {
        const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
        if (!stored)
            return [];
        return JSON.parse(stored).slice(0, limit);
    }
    catch {
        return [];
    }
}
function clearYouTubeLocalData() {
    localStorage.removeItem(PLAYLIST_KEY);
    localStorage.removeItem(RECENT_KEY);
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    // Legacy cleanup from previous iterations.
    const legacyKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key)
            continue;
        if (key.startsWith('moodverter_') &&
            key !== 'moodverter_data_reset_20260209') {
            legacyKeys.push(key);
        }
    }
    legacyKeys.forEach((key) => localStorage.removeItem(key));
    searchCache.clear();
    ytdlpCircuitOpenUntil = 0;
}
async function searchVideos(query, limit = 10) {
    const normalized = query.trim();
    if (!normalized)
        return [];
    if (normalized.length < 3)
        return [];
    const cacheKey = `${normalized.toLowerCase()}::${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt <= SEARCH_CACHE_TTL_MS) {
        return cached.results;
    }
    const directVideoId = extractYouTubeVideoId(normalized);
    if (directVideoId) {
        const directVideoInfo = await getVideoInfo(directVideoId);
        if (directVideoInfo) {
            const directResult = [directVideoInfo];
            searchCache.set(cacheKey, {
                savedAt: Date.now(),
                results: directResult,
            });
            return directResult;
        }
    }
    const shouldRunYtDlp = Date.now() >= ytdlpCircuitOpenUntil;
    const primaryOutcomePromise = shouldRunYtDlp
        ? (0, ytdlp_1.searchYouTube)(normalized, limit)
            .then((results) => {
            ytdlpCircuitOpenUntil = 0;
            return {
                results: results.map(ytdlpResultToSearchResult),
                error: null,
            };
        })
            .catch((error) => {
            if ((0, ytdlp_1.isYtDlpError)(error)
                && (error.code === 'YTDLP_BINARY_NOT_FOUND'
                    || error.code === 'YTDLP_CONTRACT_MISMATCH')) {
                ytdlpCircuitOpenUntil = Date.now() + YTDLP_CIRCUIT_OPEN_MS;
            }
            return {
                results: [],
                error,
            };
        })
        : Promise.resolve({
            results: [],
            error: null,
        });
    const tauriPublicFallbackPromise = (0, ytdlp_1.searchYouTubePublic)(normalized, limit)
        .then((results) => results.map(ytdlpResultToSearchResult))
        .catch(() => []);
    const tauriWebFallbackPromise = (0, ytdlp_1.searchYouTubeWeb)(normalized, limit)
        .then((results) => results.map(ytdlpResultToSearchResult))
        .catch(() => []);
    const browserPublicFallbackPromise = searchPublicEndpointsFallback(normalized, limit);
    const publicFallbackPromise = firstNonEmptyResult([
        tauriWebFallbackPromise,
        tauriPublicFallbackPromise,
        browserPublicFallbackPromise,
    ]).then((results) => results ?? []);
    const fastWinner = await firstNonEmptyResult([
        primaryOutcomePromise.then((outcome) => outcome.results),
        publicFallbackPromise,
    ]);
    if (fastWinner) {
        searchCache.set(cacheKey, {
            savedAt: Date.now(),
            results: fastWinner,
        });
        return fastWinner;
    }
    const fallbackResults = searchLocalPlaylistFallback(normalized, limit);
    if (fallbackResults.length > 0) {
        return fallbackResults;
    }
    const primaryOutcome = await primaryOutcomePromise;
    if (primaryOutcome.results.length > 0) {
        searchCache.set(cacheKey, {
            savedAt: Date.now(),
            results: primaryOutcome.results,
        });
        return primaryOutcome.results;
    }
    const publicFallbackResults = await publicFallbackPromise;
    if (publicFallbackResults.length > 0) {
        searchCache.set(cacheKey, {
            savedAt: Date.now(),
            results: publicFallbackResults,
        });
        return publicFallbackResults;
    }
    if (primaryOutcome.error) {
        console.warn('yt-dlp search failed:', primaryOutcome.error);
        if ((0, ytdlp_1.isYtDlpError)(primaryOutcome.error)) {
            throw new Error(`${(0, ytdlp_1.getYtDlpUserMessage)(primaryOutcome.error)} (kod: ${primaryOutcome.error.code})`);
        }
        throw new Error((0, ytdlp_1.getYtDlpUserMessage)(primaryOutcome.error));
    }
    return [];
}
function extractYouTubeVideoId(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const directIdMatch = trimmed.match(/^[A-Za-z0-9_-]{11}$/);
    if (directIdMatch)
        return directIdMatch[0];
    try {
        const url = new URL(trimmed);
        const hostname = url.hostname.toLowerCase();
        if (hostname.includes('youtube.com')) {
            const id = url.searchParams.get('v');
            if (id && /^[A-Za-z0-9_-]{11}$/.test(id))
                return id;
        }
        if (hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) {
            const id = url.pathname.replace(/\//g, '');
            if (id && /^[A-Za-z0-9_-]{11}$/.test(id))
                return id;
        }
    }
    catch {
        return null;
    }
    return null;
}
function asFiniteNumber(value) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return null;
    return value;
}
async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
        controller.abort();
    }, timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok)
            return null;
        return await response.json();
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeoutHandle);
    }
}
async function searchPublicEndpointsFallback(query, limit) {
    const boundedLimit = Math.max(1, Math.min(10, Math.floor(limit)));
    const endpointTasks = PUBLIC_SEARCH_ENDPOINTS.map((endpoint) => searchSinglePublicEndpointFallback(endpoint, query, boundedLimit));
    const winner = await firstNonEmptyResult(endpointTasks);
    return winner ?? [];
}
async function firstNonEmptyResult(tasks) {
    if (tasks.length === 0)
        return null;
    return new Promise((resolve) => {
        let pending = tasks.length;
        let settled = false;
        const completeIfDone = () => {
            if (!settled && pending <= 0) {
                settled = true;
                resolve(null);
            }
        };
        tasks.forEach((task) => {
            task
                .then((results) => {
                if (settled)
                    return;
                if (results.length > 0) {
                    settled = true;
                    resolve(results);
                    return;
                }
                pending -= 1;
                completeIfDone();
            })
                .catch(() => {
                if (settled)
                    return;
                pending -= 1;
                completeIfDone();
            });
        });
    });
}
async function searchSinglePublicEndpointFallback(endpoint, query, limit) {
    const url = `${endpoint}?q=${encodeURIComponent(query)}&filter=videos`;
    const payload = await fetchJsonWithTimeout(url, PUBLIC_SEARCH_TIMEOUT_MS);
    if (!Array.isArray(payload))
        return [];
    const mapped = payload
        .map((item) => {
        if (!item || typeof item !== 'object')
            return null;
        const row = item;
        const normalizedUrl = typeof row.url === 'string'
            ? (row.url.startsWith('http') ? row.url : `https://youtube.com${row.url}`)
            : null;
        const urlVideoId = normalizedUrl ? extractYouTubeVideoId(normalizedUrl) : null;
        const directVideoId = typeof row.id === 'string' ? extractYouTubeVideoId(row.id) : null;
        const videoId = directVideoId ?? urlVideoId;
        if (!videoId)
            return null;
        const title = typeof row.title === 'string' ? row.title.trim() : '';
        if (!title)
            return null;
        const artist = typeof row.uploaderName === 'string'
            ? row.uploaderName
            : typeof row.uploader === 'string'
                ? row.uploader
                : 'Unknown Artist';
        const durationSec = asFiniteNumber(row.duration);
        const viewCount = asFiniteNumber(row.views);
        const thumbnail = typeof row.thumbnail === 'string' && row.thumbnail.length > 0
            ? row.thumbnail
            : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        return {
            videoId,
            title,
            artist,
            thumbnail,
            duration: durationSec === null ? undefined : Math.max(0, Math.floor(durationSec * 1000)),
            viewCount: viewCount === null ? undefined : Math.max(0, Math.floor(viewCount)),
        };
    })
        .filter((item) => item !== null);
    const deduped = mapped.filter((item, index, self) => self.findIndex((other) => other.videoId === item.videoId) === index);
    return deduped.slice(0, limit);
}
function searchLocalPlaylistFallback(query, limit) {
    const normalized = query.toLowerCase();
    return getPlaylist()
        .filter((track) => `${track.title} ${track.artist}`.toLowerCase().includes(normalized))
        .slice(0, Math.max(1, limit))
        .map((track) => ({
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        duration: track.duration,
    }));
}
function ytdlpResultToSearchResult(result) {
    const { artist, title } = parseVideoTitle(result.title, result.uploader);
    return {
        videoId: result.id,
        title,
        artist,
        thumbnail: result.thumbnail || `https://i.ytimg.com/vi/${result.id}/hqdefault.jpg`,
        duration: result.duration ? result.duration * 1000 : undefined,
        viewCount: result.view_count ?? undefined,
    };
}
function parseVideoTitle(title, uploader) {
    const cleaned = title
        .replace(/\(Official\s*(Music\s*)?Video\)/gi, '')
        .replace(/\(Official\s*Audio\)/gi, '')
        .replace(/\(Lyrics?\)/gi, '')
        .replace(/\[Official\s*(Music\s*)?Video\]/gi, '')
        .replace(/\[Official\s*Audio\]/gi, '')
        .trim();
    if (cleaned.includes(' - ')) {
        const parts = cleaned.split(' - ');
        return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
    }
    return { artist: uploader || 'Unknown Artist', title: cleaned };
}
function searchResultToUnifiedTrack(result) {
    return {
        id: result.videoId,
        provider: 'youtube',
        name: result.title,
        artist: result.artist,
        albumArt: result.thumbnail,
        durationMs: result.duration || 0,
        playCount: 0,
    };
}
