import { useState, useEffect, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
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

const PROVIDER_INFO: Record<ProviderType, { name: string; description: string; icon: ReactNode }> = {
  spotify: {
    name: 'Spotify',
    description: 'Spotify kütüphanenden dinle',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
    ),
  },
  youtube: {
    name: 'YouTube',
    description: 'YouTube\'dan dinle',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    ),
  },
  mock: {
    name: 'Demo',
    description: 'Örnek şarkılarla test et',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

type TabType = 'general' | 'behavior' | 'source' | 'engine' | 'data';

const TABS: { id: TabType; label: string; icon: ReactNode }[] = [
  {
    id: 'general',
    label: 'Genel',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
  {
    id: 'behavior',
    label: 'Davranış',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
  {
    id: 'source',
    label: 'Kaynak',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
  },
  {
    id: 'engine',
    label: 'AI',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'data',
    label: 'Veri',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

  // Behavior settings
  const [hideOnBlur, setHideOnBlur] = useState(true);
  const [autostart, setAutostart] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getEngineStatus().then(setEngineStatus).catch(console.error);
      invoke<boolean>('get_hide_on_blur').then(setHideOnBlur).catch(console.error);
      invoke<boolean>('get_autostart').then(setAutostart).catch(console.error);
    }
  }, [isOpen]);

  const handleHideOnBlurChange = async (enabled: boolean) => {
    try {
      await invoke('set_hide_on_blur', { enabled });
      setHideOnBlur(enabled);
    } catch (error) {
      console.error('Failed to set hide on blur:', error);
    }
  };

  const handleAutostartChange = async (enabled: boolean) => {
    try {
      await invoke('set_autostart', { enabled });
      setAutostart(enabled);
    } catch (error) {
      console.error('Failed to set autostart:', error);
    }
  };

  if (!isOpen) return null;

  const handleProviderChange = (provider: ProviderType) => {
    onSettingsChange({ provider });
    onProviderChange?.(provider);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2">
      <div className="w-[calc(100%-1rem)] max-w-sm bg-[var(--color-surface)] border border-white/10 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Ayarlar</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation - Smaller */}
        <div className="flex border-b border-white/10">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-[var(--color-primary)] border-b border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-white/5 border border-white/5">
                <div>
                  <span className="text-sm text-[var(--color-text-primary)]">Akıllı Öneriler</span>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Yeni keşifleri akışa dahil et</p>
                </div>
                <button
                  onClick={() => onSettingsChange({ openToNewSongs: !settings.openToNewSongs })}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    settings.openToNewSongs ? 'bg-[var(--color-primary)]' : 'bg-white/20'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    settings.openToNewSongs ? 'translate-x-4' : ''
                  }`} />
                </button>
              </div>
            </div>
          )}

          {/* Behavior Tab */}
          {activeTab === 'behavior' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-white/5 border border-white/5">
                <div>
                  <span className="text-sm text-[var(--color-text-primary)]">Odak Kaybında Kapat</span>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Dışarı tıklayınca gizle</p>
                </div>
                <button
                  onClick={() => handleHideOnBlurChange(!hideOnBlur)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    hideOnBlur ? 'bg-[var(--color-primary)]' : 'bg-white/20'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    hideOnBlur ? 'translate-x-4' : ''
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/5 border border-white/5">
                <div>
                  <span className="text-sm text-[var(--color-text-primary)]">Girişte Başlat</span>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Oturum açınca otomatik başla</p>
                </div>
                <button
                  onClick={() => handleAutostartChange(!autostart)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    autostart ? 'bg-[var(--color-primary)]' : 'bg-white/20'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    autostart ? 'translate-x-4' : ''
                  }`} />
                </button>
              </div>
            </div>
          )}

          {/* Source Tab */}
          {activeTab === 'source' && (
            <div className="space-y-3">
              {availableProviders.map((provider) => {
                const info = PROVIDER_INFO[provider];
                const isActive = settings.provider === provider;

                return (
                  <button
                    key={provider}
                    onClick={() => handleProviderChange(provider)}
                    className={`w-full p-3 text-left transition-colors flex items-center gap-3 ${
                      isActive
                        ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30'
                        : 'bg-white/5 border border-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className={`p-2 ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
                      {info.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm block ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'}`}>
                        {info.name}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-secondary)]">{info.description}</span>
                    </div>
                    {isActive && (
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                    )}
                  </button>
                );
              })}

              {/* Spotify connection status */}
              {settings.provider === 'spotify' && (
                <div className="flex items-center justify-between p-3 bg-white/5 border border-white/5 mt-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${settings.spotifyConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm text-[var(--color-text-primary)]">
                      {settings.spotifyConnected ? 'Bağlı' : 'Bağlı değil'}
                    </span>
                  </div>
                  <button
                    onClick={settings.spotifyConnected ? onSpotifyDisconnect : onSpotifyConnect}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      settings.spotifyConnected
                        ? 'text-red-400 hover:bg-red-500/10'
                        : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]'
                    }`}
                  >
                    {settings.spotifyConnected ? 'Bağlantıyı Kes' : 'Bağlan'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Engine Tab */}
          {activeTab === 'engine' && (
            <div className="space-y-3">
              <div className="p-3 bg-white/5 border border-white/5">
                {engineStatus ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--color-text-primary)]">Ollama</span>
                      <span className={`px-2 py-0.5 text-[10px] font-medium ${
                        engineStatus.ollamaRunning ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                      }`}>
                        {engineStatus.ollamaRunning ? 'Aktif' : 'Kapalı'}
                      </span>
                    </div>

                    {engineStatus.ollamaRunning && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                        <div className="p-2 bg-black/20">
                          <span className="text-[10px] text-[var(--color-text-secondary)] block">LLM</span>
                          <span className={`text-xs font-medium ${engineStatus.llmAvailable ? 'text-green-500' : 'text-yellow-500'}`}>
                            {engineStatus.llmAvailable ? 'Llama 3.2' : 'Yok'}
                          </span>
                        </div>
                        <div className="p-2 bg-black/20">
                          <span className="text-[10px] text-[var(--color-text-secondary)] block">Embeddings</span>
                          <span className={`text-xs font-medium ${engineStatus.hasEmbeddings ? 'text-green-500' : 'text-yellow-500'}`}>
                            {engineStatus.hasEmbeddings ? 'nomic-embed' : 'Hazır'}
                          </span>
                        </div>
                      </div>
                    )}

                    {!engineStatus.ollamaRunning && (
                      <p className="text-[10px] text-[var(--color-text-secondary)]">
                        Yerel AI için Ollama'yı başlat
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white/20 rounded-full animate-pulse" />
                    <span className="text-sm text-[var(--color-text-secondary)]">Kontrol ediliyor...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div className="space-y-3">
              <button
                onClick={onClearCache}
                className="w-full p-3 bg-white/5 border border-white/5 text-left hover:bg-red-500/5 hover:border-red-500/20 group transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-[var(--color-text-primary)] group-hover:text-red-400">Tüm Verileri Sil</span>
                    <p className="text-[10px] text-[var(--color-text-secondary)]">Önbellek ve ayarları temizle</p>
                  </div>
                  <svg className="w-4 h-4 text-[var(--color-text-secondary)] group-hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/5 text-center">
          <p className="text-[10px] text-[var(--color-text-secondary)] opacity-50">v0.1.0</p>
        </div>
      </div>
    </div>
  );
};
