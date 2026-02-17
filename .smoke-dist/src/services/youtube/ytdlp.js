"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YtDlpError = void 0;
exports.isYtDlpError = isYtDlpError;
exports.getYtDlpUserMessage = getYtDlpUserMessage;
exports.isYtDlpAvailable = isYtDlpAvailable;
exports.searchYouTube = searchYouTube;
const core_1 = require("@tauri-apps/api/core");
class YtDlpError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.name = 'YtDlpError';
        this.details = details ?? null;
        this.userMessage = mapYtDlpCodeToUserMessage(code);
    }
}
exports.YtDlpError = YtDlpError;
let ytdlpAvailable = null;
function normalizeErrorCode(code) {
    if (!code)
        return 'YTDLP_UNKNOWN';
    const knownCodes = [
        'YTDLP_BINARY_NOT_FOUND',
        'YTDLP_SPAWN_FAILED',
        'YTDLP_NETWORK',
        'YTDLP_RATE_LIMITED',
        'YOUTUBE_AUTH_REQUIRED',
        'YTDLP_PARSE_FAILED',
        'YTDLP_SEARCH_FAILED',
        'YTDLP_CONTRACT_MISMATCH',
        'YTDLP_UNKNOWN',
    ];
    return knownCodes.includes(code)
        ? code
        : 'YTDLP_UNKNOWN';
}
function mapYtDlpCodeToUserMessage(code) {
    switch (code) {
        case 'YTDLP_BINARY_NOT_FOUND':
            return 'yt-dlp bulunamadi. Uygulama binaries klasorunu kontrol et.';
        case 'YTDLP_NETWORK':
            return 'Ag baglantisi nedeniyle YouTube aramasi tamamlanamadi.';
        case 'YTDLP_RATE_LIMITED':
            return 'YouTube rate limit uyguladi. Biraz sonra tekrar dene.';
        case 'YOUTUBE_AUTH_REQUIRED':
            return 'Bu icerik ek dogrulama gerektiriyor. Farkli bir sorgu dene.';
        case 'YTDLP_PARSE_FAILED':
            return 'Arama yaniti parse edilemedi. Uygulama guncellemesi gerekebilir.';
        case 'YTDLP_SPAWN_FAILED':
        case 'YTDLP_SEARCH_FAILED':
            return 'YouTube arama servisi su anda calismiyor.';
        case 'YTDLP_CONTRACT_MISMATCH':
            return 'Uygulama backend kontrati uyumsuz. Uygulamayi yeniden baslat.';
        case 'YTDLP_UNKNOWN':
        default:
            return 'YouTube aramasi basarisiz oldu.';
    }
}
function isYtDlpError(error) {
    return error instanceof YtDlpError;
}
function getYtDlpUserMessage(error) {
    if (error instanceof YtDlpError)
        return error.userMessage;
    return 'YouTube aramasi basarisiz oldu.';
}
async function isYtDlpAvailable() {
    if (ytdlpAvailable !== null)
        return ytdlpAvailable;
    try {
        await searchYouTube('test', 1);
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
        const response = await (0, core_1.invoke)('search_youtube_v1', { query, limit });
        if (response.ok) {
            return response.data ?? [];
        }
        const errorPayload = response.error;
        const code = normalizeErrorCode(errorPayload?.code);
        throw new YtDlpError(errorPayload?.message ?? 'yt-dlp call failed', code, errorPayload?.details ?? null);
    }
    catch (error) {
        if (error instanceof YtDlpError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('search_youtube_v1')
            || message.includes('unknown command')
            || message.includes('invalid args')) {
            throw new YtDlpError(message, 'YTDLP_CONTRACT_MISMATCH');
        }
        if (message.includes('Failed to spawn') || message.includes('yt-dlp binary not found')) {
            throw new YtDlpError(message, 'YTDLP_BINARY_NOT_FOUND');
        }
        if (message.toLowerCase().includes('network')
            || message.toLowerCase().includes('connection')
            || message.toLowerCase().includes('timeout')) {
            throw new YtDlpError(message, 'YTDLP_NETWORK');
        }
        throw new YtDlpError(message, 'YTDLP_UNKNOWN');
    }
}
