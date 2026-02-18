"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YtDlpError = void 0;
exports.isYtDlpError = isYtDlpError;
exports.getYtDlpUserMessage = getYtDlpUserMessage;
exports.setYtDlpSearchEngineOverride = setYtDlpSearchEngineOverride;
exports.__setInvokeClientForTests = __setInvokeClientForTests;
exports.__setYtDlpSearchPolicyForTests = __setYtDlpSearchPolicyForTests;
exports.__resetYtDlpRuntimeForTests = __resetYtDlpRuntimeForTests;
exports.isYtDlpAvailable = isYtDlpAvailable;
exports.searchYouTube = searchYouTube;
exports.searchYouTubePublic = searchYouTubePublic;
exports.searchYouTubeWeb = searchYouTubeWeb;
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
let runtimeEngineOverride = null;
let runtimePolicyOverride = null;
const defaultInvokeClient = (command, args) => (0, core_1.invoke)(command, args);
let invokeClient = defaultInvokeClient;
const DEFAULT_SEARCH_POLICY = {
    maxAttempts: 2,
    timeoutMs: 8000,
    baseBackoffMs: 300,
};
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function getRuntimeEnv() {
    const globalEnv = globalThis.__MOODVERTER_ENV__;
    if (globalEnv)
        return globalEnv;
    const processEnv = globalThis.process?.env;
    return processEnv ?? {};
}
function parseEngine(value) {
    if (!value)
        return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'auto')
        return 'auto';
    if (normalized === 'tauri-v1')
        return 'tauri-v1';
    if (normalized === 'tauri-legacy')
        return 'tauri-legacy';
    return null;
}
function getEnvSearchEngine() {
    const env = getRuntimeEnv();
    return parseEngine(env.MOODVERTER_YTDLP_ENGINE ?? env.VITE_YTDLP_ENGINE);
}
function parsePositiveInteger(raw) {
    if (!raw)
        return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed))
        return undefined;
    const integer = Math.floor(parsed);
    return integer > 0 ? integer : undefined;
}
function getEnvSearchPolicyOverride() {
    const env = getRuntimeEnv();
    return {
        maxAttempts: parsePositiveInteger(env.MOODVERTER_YTDLP_MAX_ATTEMPTS ?? env.VITE_YTDLP_MAX_ATTEMPTS),
        timeoutMs: parsePositiveInteger(env.MOODVERTER_YTDLP_TIMEOUT_MS ?? env.VITE_YTDLP_TIMEOUT_MS),
        baseBackoffMs: parsePositiveInteger(env.MOODVERTER_YTDLP_BACKOFF_MS ?? env.VITE_YTDLP_BACKOFF_MS),
    };
}
function normalizeErrorCode(code) {
    if (!code)
        return 'YTDLP_UNKNOWN';
    const knownCodes = [
        'YTDLP_BINARY_NOT_FOUND',
        'YTDLP_SPAWN_FAILED',
        'YTDLP_NETWORK',
        'YTDLP_RATE_LIMITED',
        'YTDLP_TIMEOUT',
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
        case 'YTDLP_TIMEOUT':
            return 'YouTube aramasi zaman asimina ugradi. Tekrar dene.';
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
    return 'YouTube aramasi basarisiz oldu. YouTube linki yapistirarak eklemeyi dene.';
}
function getSearchPolicy() {
    const envPolicy = getEnvSearchPolicyOverride();
    const merged = {
        ...DEFAULT_SEARCH_POLICY,
        ...envPolicy,
        ...(runtimePolicyOverride ?? {}),
    };
    return {
        maxAttempts: Math.max(1, Math.min(5, Math.floor(merged.maxAttempts))),
        timeoutMs: Math.max(500, Math.min(30000, Math.floor(merged.timeoutMs))),
        baseBackoffMs: Math.max(50, Math.min(5000, Math.floor(merged.baseBackoffMs))),
    };
}
function setYtDlpSearchEngineOverride(engine) {
    runtimeEngineOverride = engine;
}
function resolveSearchEngine() {
    return runtimeEngineOverride ?? getEnvSearchEngine() ?? 'auto';
}
function isRetryableError(code) {
    return code === 'YTDLP_NETWORK' || code === 'YTDLP_RATE_LIMITED' || code === 'YTDLP_TIMEOUT';
}
async function invokeWithTimeout(command, args, timeoutMs) {
    let timeoutHandle = null;
    try {
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new YtDlpError(`Command timed out: ${command}`, 'YTDLP_TIMEOUT'));
            }, timeoutMs);
        });
        return await Promise.race([invokeClient(command, args), timeoutPromise]);
    }
    finally {
        if (timeoutHandle)
            clearTimeout(timeoutHandle);
    }
}
function toYtDlpError(error) {
    if (error instanceof YtDlpError)
        return error;
    if (error && typeof error === 'object') {
        const payload = error;
        const nested = payload.error;
        const payloadCode = typeof payload.code === 'string'
            ? payload.code
            : typeof nested?.code === 'string'
                ? nested.code
                : undefined;
        const payloadMessage = typeof payload.message === 'string'
            ? payload.message
            : typeof nested?.message === 'string'
                ? nested.message
                : undefined;
        const payloadDetails = typeof payload.details === 'string'
            ? payload.details
            : typeof nested?.details === 'string'
                ? nested.details
                : null;
        const hasStructuredPayload = Boolean(payloadCode) || nested != null;
        if (hasStructuredPayload) {
            return new YtDlpError(payloadMessage ?? 'yt-dlp call failed', normalizeErrorCode(payloadCode), payloadDetails);
        }
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('search_youtube_v1')
        || message.includes('unknown command')
        || message.includes('invalid args')) {
        return new YtDlpError(message, 'YTDLP_CONTRACT_MISMATCH');
    }
    if (message.includes('Failed to spawn') || message.includes('yt-dlp binary not found')) {
        return new YtDlpError(message, 'YTDLP_BINARY_NOT_FOUND');
    }
    if (message.toLowerCase().includes('network')
        || message.toLowerCase().includes('connection')
        || message.toLowerCase().includes('timeout')) {
        return new YtDlpError(message, 'YTDLP_NETWORK');
    }
    if (message.toLowerCase().includes('semaphore')
        || message.toLowerCase().includes('operation not permitted')) {
        return new YtDlpError(message, 'YTDLP_SPAWN_FAILED');
    }
    const legacyCodeMatch = message.match(/^([A-Z0-9_]+):\s*(.+)$/);
    if (legacyCodeMatch) {
        return new YtDlpError(legacyCodeMatch[2], normalizeErrorCode(legacyCodeMatch[1]));
    }
    return new YtDlpError(message, 'YTDLP_UNKNOWN');
}
async function callTauriV1(query, limit) {
    const policy = getSearchPolicy();
    const response = await invokeWithTimeout('search_youtube_v1', { query, limit }, policy.timeoutMs);
    if (typeof response !== 'object' || response === null || typeof response.ok !== 'boolean') {
        throw new YtDlpError('Invalid response envelope from search_youtube_v1', 'YTDLP_CONTRACT_MISMATCH');
    }
    if (response.ok) {
        return response.data ?? [];
    }
    const errorPayload = response.error;
    throw new YtDlpError(errorPayload?.message ?? 'yt-dlp call failed', normalizeErrorCode(errorPayload?.code), errorPayload?.details ?? null);
}
async function callTauriLegacy(query, limit) {
    const policy = getSearchPolicy();
    const response = await invokeWithTimeout('search_youtube', { query, limit }, policy.timeoutMs);
    if (!Array.isArray(response)) {
        throw new YtDlpError('Invalid response payload from search_youtube', 'YTDLP_CONTRACT_MISMATCH');
    }
    return response;
}
async function runEngineWithRetry(engine, query, limit) {
    const policy = getSearchPolicy();
    let lastError = null;
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
        try {
            if (engine === 'tauri-v1')
                return await callTauriV1(query, limit);
            return await callTauriLegacy(query, limit);
        }
        catch (error) {
            lastError = toYtDlpError(error);
            const shouldRetry = isRetryableError(lastError.code) && attempt < policy.maxAttempts;
            if (!shouldRetry) {
                throw lastError;
            }
            const backoffMs = policy.baseBackoffMs * (2 ** (attempt - 1));
            await wait(backoffMs);
        }
    }
    throw lastError ?? new YtDlpError('yt-dlp search failed', 'YTDLP_UNKNOWN');
}
function __setInvokeClientForTests(client) {
    invokeClient = client ?? defaultInvokeClient;
}
function __setYtDlpSearchPolicyForTests(policy) {
    runtimePolicyOverride = policy;
}
function __resetYtDlpRuntimeForTests() {
    runtimeEngineOverride = null;
    runtimePolicyOverride = null;
    invokeClient = defaultInvokeClient;
    ytdlpAvailable = null;
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
    const boundedLimit = Math.max(1, Math.min(25, Math.floor(limit)));
    const engine = resolveSearchEngine();
    try {
        if (engine === 'tauri-v1') {
            return await runEngineWithRetry('tauri-v1', query, boundedLimit);
        }
        if (engine === 'tauri-legacy') {
            return await runEngineWithRetry('tauri-legacy', query, boundedLimit);
        }
        try {
            return await runEngineWithRetry('tauri-v1', query, boundedLimit);
        }
        catch (error) {
            const firstError = toYtDlpError(error);
            if (firstError.code !== 'YTDLP_CONTRACT_MISMATCH') {
                throw firstError;
            }
            return await runEngineWithRetry('tauri-legacy', query, boundedLimit);
        }
    }
    catch (error) {
        throw toYtDlpError(error);
    }
}
async function searchYouTubePublic(query, limit = 10) {
    const boundedLimit = Math.max(1, Math.min(25, Math.floor(limit)));
    const response = await invokeWithTimeout('search_youtube_public_v1', { query, limit: boundedLimit }, 2000);
    if (typeof response !== 'object' || response === null || typeof response.ok !== 'boolean') {
        throw new YtDlpError('Invalid response envelope from search_youtube_public_v1', 'YTDLP_CONTRACT_MISMATCH');
    }
    if (response.ok) {
        return response.data ?? [];
    }
    const errorPayload = response.error;
    throw new YtDlpError(errorPayload?.message ?? 'public youtube search failed', normalizeErrorCode(errorPayload?.code), errorPayload?.details ?? null);
}
async function searchYouTubeWeb(query, limit = 10) {
    const boundedLimit = Math.max(1, Math.min(25, Math.floor(limit)));
    const response = await invokeWithTimeout('search_youtube_web_v1', { query, limit: boundedLimit }, 4000);
    if (typeof response !== 'object' || response === null || typeof response.ok !== 'boolean') {
        throw new YtDlpError('Invalid response envelope from search_youtube_web_v1', 'YTDLP_CONTRACT_MISMATCH');
    }
    if (response.ok) {
        return response.data ?? [];
    }
    const errorPayload = response.error;
    throw new YtDlpError(errorPayload?.message ?? 'youtube web search failed', normalizeErrorCode(errorPayload?.code), errorPayload?.details ?? null);
}
