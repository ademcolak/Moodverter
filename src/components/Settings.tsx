import { useState, useEffect, type ReactNode } from 'react';
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

type TabType = 'general' | 'source' | 'engine' | 'data';

const TABS: { id: TabType; label: string; icon: ReactNode }[] = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
  {
    id: 'source',
    label: 'Source',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
  },
  {
    id: 'engine',
    label: 'Engine',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'data',
    label: 'Data',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
    ),
  },
];

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
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isAddingTrack, setIsAddingTrack] = useState(false);

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
      const { getYouTubeProvider } = await import('../services/providers/youtube');
      const provider = getYouTubeProvider();
      const track = await provider.addTrackFromUrl(youtubeUrl);

      if (track) {
        setYoutubeUrl('');
      }
    } catch (error) {
      console.error('Failed to add track:', error);
    } finally {
      setIsAddingTrack(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[var(--color-surface)] shadow-2xl border border-white/5 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="text-lg font-black text-[var(--color-text-primary)] uppercase tracking-wider">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === tab.id
                  ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-white/5">
                <div>
                  <span className="text-sm font-bold text-[var(--color-text-primary)]">Smart Recommendations</span>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Include new discoveries in flow</p>
                </div>
                <button
                  onClick={() => onSettingsChange({ openToNewSongs: !settings.openToNewSongs })}
                  className={`relative w-10 h-6 rounded-full transition-all ${
                    settings.openToNewSongs ? 'bg-[var(--color-primary)]' : 'bg-white/10'
                  }`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${
                    settings.openToNewSongs ? 'translate-x-4' : ''
                  }`} />
                </button>
              </div>

              <div className="p-4 bg-white/5 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-bold text-[var(--color-text-secondary)]">Tray Control</span>
                </div>
                <p className="text-[10px] text-[var(--color-text-secondary)] leading-relaxed">
                  Click the tray icon to show/hide. Right-click for menu.
                </p>
              </div>
            </div>
          )}

          {/* Source Tab */}
          {activeTab === 'source' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2">
                {availableProviders.map((provider) => (
                  <button
                    key={provider}
                    onClick={() => handleProviderChange(provider)}
                    className={`w-full p-4 text-left transition-all group ${
                      settings.provider === provider
                        ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/50'
                        : 'bg-white/5 border border-transparent hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 ${
                          settings.provider === provider ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]' : 'bg-white/5 text-[var(--color-text-secondary)]'
                        }`}>
                          {provider === 'spotify' && (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                            </svg>
                          )}
                          {provider === 'youtube' && (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                            </svg>
                          )}
                          {provider === 'mock' && (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <span className={`text-sm font-bold ${settings.provider === provider ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'}`}>
                            {PROVIDER_INFO[provider].name}
                          </span>
                          <p className="text-xs text-[var(--color-text-secondary)] opacity-70">
                            {PROVIDER_INFO[provider].description}
                          </p>
                        </div>
                      </div>
                      {settings.provider === provider && (
                        <div className="w-2 h-2 bg-[var(--color-primary)] shadow-[0_0_8px_var(--color-primary)]" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Provider-specific options */}
              {settings.provider === 'spotify' && (
                <div className="p-4 bg-white/5 border border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 ${settings.spotifyConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                      <span className="text-sm font-bold text-[var(--color-text-primary)]">Connection</span>
                    </div>
                    <button
                      onClick={settings.spotifyConnected ? onSpotifyDisconnect : onSpotifyConnect}
                      className={`px-4 py-2 text-xs font-black uppercase tracking-wider transition-all ${
                        settings.spotifyConnected
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                          : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]'
                      }`}
                    >
                      {settings.spotifyConnected ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                </div>
              )}

              {settings.provider === 'youtube' && (
                <div className="p-4 bg-white/5 border border-white/5 space-y-3">
                  <span className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                    Import via URL
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="Paste YouTube link..."
                      className="flex-1 px-3 py-2 bg-black/20 text-[var(--color-text-primary)] text-sm border border-white/5 focus:border-[var(--color-primary)] focus:outline-none transition-all"
                    />
                    <button
                      onClick={handleAddYouTubeTrack}
                      disabled={isAddingTrack || !youtubeUrl.trim()}
                      className="px-4 py-2 bg-[var(--color-primary)] text-white text-xs font-black uppercase tracking-wider transition-all hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                    >
                      {isAddingTrack ? '...' : 'Add'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Engine Tab */}
          {activeTab === 'engine' && (
            <div className="space-y-4">
              <div className="p-4 bg-white/5 border border-white/5">
                {engineStatus ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[var(--color-text-primary)]">Ollama Service</span>
                      <span className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider ${
                        engineStatus.ollamaRunning ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                      }`}>
                        {engineStatus.ollamaRunning ? 'Online' : 'Offline'}
                      </span>
                    </div>

                    {engineStatus.ollamaRunning && (
                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                        <div className="p-3 bg-black/20">
                          <span className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase tracking-wider block mb-1">LLM</span>
                          <span className={`text-sm font-bold ${engineStatus.llmAvailable ? 'text-green-500' : 'text-yellow-500'}`}>
                            {engineStatus.llmAvailable ? 'Llama 3.2' : 'Missing'}
                          </span>
                        </div>
                        <div className="p-3 bg-black/20">
                          <span className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase tracking-wider block mb-1">Embeddings</span>
                          <span className={`text-sm font-bold ${engineStatus.hasEmbeddings ? 'text-green-500' : 'text-yellow-500'}`}>
                            {engineStatus.hasEmbeddings ? 'nomic-embed' : 'Ready'}
                          </span>
                        </div>
                      </div>
                    )}

                    {!engineStatus.ollamaRunning && (
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        Start Ollama to enable local AI features
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 animate-pulse">
                    <div className="w-2 h-2 bg-white/20" />
                    <span className="text-sm text-[var(--color-text-secondary)] font-bold">Checking engine...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div className="space-y-4">
              <button
                onClick={onClearCache}
                className="w-full p-4 bg-white/5 text-left border border-transparent hover:border-red-500/30 hover:bg-red-500/5 group transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-[var(--color-text-primary)] group-hover:text-red-400">Clear All Data</span>
                    <p className="text-[10px] text-[var(--color-text-secondary)]">Flush database, cache & settings</p>
                  </div>
                  <svg className="w-5 h-5 text-[var(--color-text-secondary)] group-hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
              </button>

              <div className="p-4 bg-white/5 border border-white/5">
                <span className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase tracking-wider">Storage</span>
                <p className="text-sm text-[var(--color-text-primary)] mt-1">Local browser storage</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-black/20 border-t border-white/5 text-center">
          <p className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase tracking-widest opacity-30">
            Moodverter v0.1.0
          </p>
        </div>
      </div>
    </div>
  );
};
