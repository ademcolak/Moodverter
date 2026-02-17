import { invoke } from '@tauri-apps/api/core';

export interface SearchResult {
  id: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  view_count: number | null;
  thumbnail: string | null;
}

export type YtDlpErrorCode =
  | 'YTDLP_BINARY_NOT_FOUND'
  | 'YTDLP_SPAWN_FAILED'
  | 'YTDLP_NETWORK'
  | 'YTDLP_RATE_LIMITED'
  | 'YOUTUBE_AUTH_REQUIRED'
  | 'YTDLP_PARSE_FAILED'
  | 'YTDLP_SEARCH_FAILED'
  | 'YTDLP_CONTRACT_MISMATCH'
  | 'YTDLP_UNKNOWN';

interface InvokeErrorPayload {
  code: string;
  message: string;
  details?: string | null;
}

interface InvokeResponse<T> {
  ok: boolean;
  data?: T | null;
  error?: InvokeErrorPayload | null;
}

export class YtDlpError extends Error {
  public readonly userMessage: string;
  public readonly details: string | null;

  constructor(
    message: string,
    public readonly code: YtDlpErrorCode,
    details?: string | null
  ) {
    super(message);
    this.name = 'YtDlpError';
    this.details = details ?? null;
    this.userMessage = mapYtDlpCodeToUserMessage(code);
  }
}

let ytdlpAvailable: boolean | null = null;

function normalizeErrorCode(code: string | undefined): YtDlpErrorCode {
  if (!code) return 'YTDLP_UNKNOWN';
  const knownCodes: YtDlpErrorCode[] = [
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
  return knownCodes.includes(code as YtDlpErrorCode)
    ? (code as YtDlpErrorCode)
    : 'YTDLP_UNKNOWN';
}

function mapYtDlpCodeToUserMessage(code: YtDlpErrorCode): string {
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

export function isYtDlpError(error: unknown): error is YtDlpError {
  return error instanceof YtDlpError;
}

export function getYtDlpUserMessage(error: unknown): string {
  if (error instanceof YtDlpError) return error.userMessage;
  return 'YouTube aramasi basarisiz oldu.';
}

export async function isYtDlpAvailable(): Promise<boolean> {
  if (ytdlpAvailable !== null) return ytdlpAvailable;
  try {
    await searchYouTube('test', 1);
    ytdlpAvailable = true;
    return true;
  } catch (error) {
    console.warn('yt-dlp not available:', error);
    ytdlpAvailable = false;
    return false;
  }
}

export async function searchYouTube(query: string, limit = 10): Promise<SearchResult[]> {
  try {
    const response = await invoke<InvokeResponse<SearchResult[]>>('search_youtube_v1', { query, limit });
    if (response.ok) {
      return response.data ?? [];
    }

    const errorPayload = response.error;
    const code = normalizeErrorCode(errorPayload?.code);
    throw new YtDlpError(
      errorPayload?.message ?? 'yt-dlp call failed',
      code,
      errorPayload?.details ?? null
    );
  } catch (error) {
    if (error instanceof YtDlpError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('search_youtube_v1')
      || message.includes('unknown command')
      || message.includes('invalid args')
    ) {
      throw new YtDlpError(message, 'YTDLP_CONTRACT_MISMATCH');
    }
    if (message.includes('Failed to spawn') || message.includes('yt-dlp binary not found')) {
      throw new YtDlpError(message, 'YTDLP_BINARY_NOT_FOUND');
    }
    if (
      message.toLowerCase().includes('network')
      || message.toLowerCase().includes('connection')
      || message.toLowerCase().includes('timeout')
    ) {
      throw new YtDlpError(message, 'YTDLP_NETWORK');
    }
    throw new YtDlpError(message, 'YTDLP_UNKNOWN');
  }
}
