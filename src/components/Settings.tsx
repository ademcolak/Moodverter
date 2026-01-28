import { useState } from 'react';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: {
    openToNewSongs: boolean;
    spotifyConnected: boolean;
    openAiApiKey: string;
  };
  onSettingsChange: (settings: Partial<SettingsProps['settings']>) => void;
  onClearCache: () => void;
  onSpotifyConnect: () => void;
  onSpotifyDisconnect: () => void;
}

export const Settings = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onClearCache,
  onSpotifyConnect,
  onSpotifyDisconnect,
}: SettingsProps) => {
  const [showApiKey, setShowApiKey] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md p-6 bg-[var(--color-surface)] rounded-xl shadow-xl">
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
          {/* Spotify Connection */}
          <div className="p-4 bg-[var(--color-background)] rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[var(--color-text-primary)] font-medium">Spotify</h3>
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

          {/* OpenAI API Key */}
          <div className="p-4 bg-[var(--color-background)] rounded-lg">
            <h3 className="text-[var(--color-text-primary)] font-medium mb-2">OpenAI API Key</h3>
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
                {showApiKey ? '👁️' : '👁️‍🗨️'}
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
                  Include Spotify recommendations
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
