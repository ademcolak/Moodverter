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
const searchCache = new Map();
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
    try {
        const results = await (0, ytdlp_1.searchYouTube)(normalized, limit);
        const mapped = results.map(ytdlpResultToSearchResult);
        searchCache.set(cacheKey, {
            savedAt: Date.now(),
            results: mapped,
        });
        return mapped;
    }
    catch (error) {
        const fallbackResults = searchLocalPlaylistFallback(normalized, limit);
        if (fallbackResults.length > 0) {
            return fallbackResults;
        }
        console.warn('yt-dlp search failed:', error);
        throw new Error((0, ytdlp_1.getYtDlpUserMessage)(error));
    }
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
