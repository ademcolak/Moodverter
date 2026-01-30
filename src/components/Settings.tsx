import { useState, useEffect } from 'react';
import type { ProviderType } from '../types/provider';
import type { EngineStatus } from '../services/mood/engine';
import { getEngineStatus } from '../services/mood/engine';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: {
    openToNewSongs: boolean;
    spotifyConnected: boolean;
    openAiApiKey: string;
    provider: ProviderType;
  };
  onSettingsChange: (settings: Partial<SettingsProps['settings']>) => void;
  onClearCache: () => void;
  onSpotifyConnect: () => void;
  onSpotifyDisconnect: () => void;
  onProviderChange?: (provider: ProviderType) => void;
  availableProviders?: ProviderType[];
}

const PROVIDER_INFO: Record<ProviderType, { name: string; description: string }> = {
  spotify: {
    name: 'Spotify',
    description: 'Stream from your Spotify library',
  },
  youtube: {
    name: 'YouTube',
    description: 'Play videos from YouTube',
  },
  mock: {
    name: 'Demo Mode',
    description: 'Test with sample tracks',
  },
};

export const Settings = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onClearCache,
  onSpotifyConnect,
  onSpotifyDisconnect,
  onProviderChange,
  availableProviders = ['mock', 'spotify', 'youtube'],
}: SettingsProps) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isAddingTrack, setIsAddingTrack] = useState(false);

  // Load engine status when settings open
  useEffect(() => {
    if (isOpen) {
      getEngineStatus().then(setEngineStatus).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProviderChange = (provider: ProviderType) => {
    onSettingsChange({ provider });
    onProviderChange?.(provider);
  };

  const handleAddYouTubeTrack = async () => {
    if (!youtubeUrl.trim()) return;

    setIsAddingTrack(true);
    try {
      // Import dynamically to avoid circular deps
      const { getYouTubeProvider } = await import('../services/providers/youtube');
      const provider = getYouTubeProvider();
      const track = await provider.addTrackFromUrl(youtubeUrl);

      if (track) {
        setYoutubeUrl('');
        // Could show a success toast here
      }
    } catch (error) {
      console.error('Failed to add track:', error);
    } finally {
      setIsAddingTrack(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto p-6 bg-[var(--color-surface)] rounded-xl shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* Music Provider Selection */}
          <div className="p-4 bg-[var(--color-background)] rounded-lg">
            <h3 className="text-[var(--color-text-primary)] font-medium mb-3">Music Provider</h3>
            <div className="space-y-2">
              {availableProviders.map((provider) => (
                <button
                  key={provider}
                  onClick={() => handleProviderChange(provider)}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    settings.provider === provider
                      ? 'bg-[var(--color-primary)]/20 border border-[var(--color-primary)]'
                      : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-light)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[var(--color-text-primary)] font-medium">
                        {PROVIDER_INFO[provider].name}
                      </span>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {PROVIDER_INFO[provider].description}
                      </p>
                    </div>
                    {settings.provider === provider && (
                      <svg className="w-5 h-5 text-[var(--color-primary)]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Spotify Connection - Show only when Spotify is selected */}
          {settings.provider === 'spotify' && (
            <div className="p-4 bg-[var(--color-background)] rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[var(--color-text-primary)] font-medium">Spotify Account</h3>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {settings.spotifyConnected ? 'Connected' : 'Not connected'}
                  </p>
                </div>
                <button
                  onClick={settings.spotifyConnected ? onSpotifyDisconnect : onSpotifyConnect}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    settings.spotifyConnected
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]'
                  }`}
                >
                  {settings.spotifyConnected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </div>
          )}

          {/* YouTube URL Add - Show only when YouTube is selected */}
          {settings.provider === 'youtube' && (
            <div className="p-4 bg-[var(--color-background)] rounded-lg">
              <h3 className="text-[var(--color-text-primary)] font-medium mb-2">Add YouTube Track</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="Paste YouTube URL..."
                  className="flex-1 px-3 py-2 bg-[var(--color-surface)] rounded-lg
                             text-[var(--color-text-primary)] text-sm
                             border border-[var(--color-surface-light)]
                             focus:border-[var(--color-primary)] focus:outline-none"
                />
                <button
                  onClick={handleAddYouTubeTrack}
                  disabled={isAddingTrack || !youtubeUrl.trim()}
                  className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg
                             text-sm font-medium transition-colors
                             hover:bg-[var(--color-primary-dark)]
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAddingTrack ? '...' : 'Add'}
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                Add videos to your library by URL
              </p>
            </div>
          )}

          {/* Ollama Status */}
          <div className="p-4 bg-[var(--color-background)] rounded-lg">
            <h3 className="text-[var(--color-text-primary)] font-medium mb-2">AI Engine (Ollama)</h3>
            {engineStatus ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      engineStatus.ollamaRunning ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {engineStatus.ollamaRunning ? 'Running' : 'Not running'}
                  </span>
                </div>
                {engineStatus.ollamaRunning && (
                  <>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          engineStatus.llmAvailable ? 'bg-green-500' : 'bg-yellow-500'
                        }`}
                      />
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        LLM: {engineStatus.llmAvailable ? 'Available' : 'Model not found'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          engineStatus.hasEmbeddings ? 'bg-green-500' : 'bg-yellow-500'
                        }`}
                      />
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        Embeddings: {engineStatus.hasEmbeddings ? 'Ready' : 'Not generated'}
                      </span>
                    </div>
                  </>
                )}
                {!engineStatus.ollamaRunning && (
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Run <code className="px-1 bg-[var(--color-surface)] rounded">ollama serve</code> to enable AI features
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">Checking status...</p>
            )}
          </div>

          {/* OpenAI API Key (Legacy) */}
          <div className="p-4 bg-[var(--color-background)] rounded-lg">
            <h3 className="text-[var(--color-text-primary)] font-medium mb-2">
              OpenAI API Key <span className="text-xs text-[var(--color-text-secondary)]">(Optional fallback)</span>
            </h3>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.openAiApiKey}
                onChange={(e) => onSettingsChange({ openAiApiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-[var(--color-surface)] rounded-lg
                           text-[var(--color-text-primary)] text-sm
                           border border-[var(--color-surface-light)]
                           focus:border-[var(--color-primary)] focus:outline-none"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1
                           text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showApiKey ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Open to New Songs Toggle */}
          <div className="p-4 bg-[var(--color-background)] rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[var(--color-text-primary)] font-medium">
                  Open to New Songs
                </h3>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Include recommendations
                </p>
              </div>
              <button
                onClick={() => onSettingsChange({ openToNewSongs: !settings.openToNewSongs })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.openToNewSongs ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-light)]'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    settings.openToNewSongs ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Clear Cache */}
          <button
            onClick={onClearCache}
            className="w-full px-4 py-3 bg-[var(--color-background)] rounded-lg
                       text-[var(--color-text-secondary)] hover:text-red-400
                       text-sm font-medium transition-colors"
          >
            Clear Cache
          </button>
        </div>
      </div>
    </div>
  );
};
