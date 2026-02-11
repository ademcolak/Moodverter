"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YtDlpError = void 0;
exports.isYtDlpAvailable = isYtDlpAvailable;
exports.searchYouTube = searchYouTube;
const core_1 = require("@tauri-apps/api/core");
class YtDlpError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'YtDlpError';
    }
}
exports.YtDlpError = YtDlpError;
let ytdlpAvailable = null;
async function isYtDlpAvailable() {
    if (ytdlpAvailable !== null)
        return ytdlpAvailable;
    try {
        await (0, core_1.invoke)('search_youtube', { query: 'test', limit: 1 });
        ytdlpAvailable = true;
        return true;
    }
    catch (error) {
        console.warn('yt-dlp not available:', error);
        ytdlpAvailable = false;
        return false;
    }
}
async function searchYouTube(query, limit = 10) {
    try {
        return await (0, core_1.invoke)('search_youtube', { query, limit });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('Failed to spawn')) {
            throw new YtDlpError('yt-dlp binary not found', 'BINARY_NOT_FOUND');
        }
        if (message.includes('network') || message.includes('connection')) {
            throw new YtDlpError('Network error during search', 'NETWORK_ERROR');
        }
        throw new YtDlpError(message, 'UNKNOWN');
    }
}
