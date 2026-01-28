import { SpotifyAudioAnalysis, SpotifySection } from '../../types/spotify';
import * as api from './api';

interface IntroOutroPoints {
  introEndMs: number;
  outroStartMs: number;
}

// Analyze track to find intro and outro points
export const findIntroOutroPoints = async (
  accessToken: string,
  trackId: string
): Promise<IntroOutroPoints> => {
  const analysis = await api.getAudioAnalysis(accessToken, trackId);
  
  const introEndMs = detectIntroEnd(analysis);
  const outroStartMs = detectOutroStart(analysis);
  
  return { introEndMs, outroStartMs };
};

// Detect where the intro ends based on section analysis
const detectIntroEnd = (analysis: SpotifyAudioAnalysis): number => {
  const sections = analysis.sections;
  if (sections.length < 2) return 0;
  
  // Look for significant energy/loudness increase in first few sections
  const firstSection = sections[0];
  
  for (let i = 1; i < Math.min(sections.length, 4); i++) {
    const section = sections[i];
    const loudnessDiff = section.loudness - firstSection.loudness;
    
    // If there's a significant loudness increase, the intro likely ends before this section
    if (loudnessDiff > 3) {
      return Math.round(section.start * 1000);
    }
  }
  
  // Default: first section end
  return Math.round(firstSection.duration * 1000);
};

// Detect where the outro starts based on section analysis
const detectOutroStart = (analysis: SpotifyAudioAnalysis): number => {
  const sections = analysis.sections;
  if (sections.length < 2) {
    return analysis.sections.reduce((sum, s) => sum + s.duration, 0) * 1000;
  }
  
  // Look at last few sections for energy drop
  const totalDuration = sections.reduce((sum, s) => sum + s.duration, 0);
  
  for (let i = sections.length - 1; i > Math.max(0, sections.length - 4); i--) {
    const section = sections[i];
    const prevSection = sections[i - 1];
    
    if (prevSection) {
      const loudnessDiff = prevSection.loudness - section.loudness;
      
      // If there's a significant loudness drop, the outro likely starts at this section
      if (loudnessDiff > 3) {
        return Math.round(section.start * 1000);
      }
    }
  }
  
  // Default: 90% of track duration
  return Math.round(totalDuration * 0.9 * 1000);
};

// Calculate optimal transition point between two tracks
export const calculateTransitionPoint = (
  currentTrackDurationMs: number,
  currentOutroStartMs: number,
  nextIntroEndMs: number
): { seekPoint: number; transitionPoint: number } => {
  // Start transition at outro of current track
  const transitionPoint = Math.max(
    currentOutroStartMs,
    currentTrackDurationMs - 30000 // At least 30s before end
  );
  
  // Seek to after intro in next track
  const seekPoint = nextIntroEndMs;
  
  return {
    seekPoint,
    transitionPoint,
  };
};

// Analyze sections for energy flow
export const analyzeEnergyFlow = (sections: SpotifySection[]): {
  peakSection: number;
  avgEnergy: number;
  energyProfile: 'building' | 'steady' | 'declining' | 'dynamic';
} => {
  if (sections.length === 0) {
    return { peakSection: 0, avgEnergy: 0.5, energyProfile: 'steady' };
  }

  // Use loudness as proxy for energy (normalize to 0-1 scale)
  const loudnesses = sections.map(s => s.loudness);
  const minLoudness = Math.min(...loudnesses);
  const maxLoudness = Math.max(...loudnesses);
  const range = maxLoudness - minLoudness || 1;
  
  const normalizedEnergies = loudnesses.map(l => (l - minLoudness) / range);
  const avgEnergy = normalizedEnergies.reduce((a, b) => a + b, 0) / normalizedEnergies.length;
  
  // Find peak section
  const peakSection = normalizedEnergies.indexOf(Math.max(...normalizedEnergies));
  
  // Determine energy profile
  const firstThirdAvg = normalizedEnergies.slice(0, Math.ceil(sections.length / 3))
    .reduce((a, b) => a + b, 0) / Math.ceil(sections.length / 3);
  const lastThirdAvg = normalizedEnergies.slice(-Math.ceil(sections.length / 3))
    .reduce((a, b) => a + b, 0) / Math.ceil(sections.length / 3);
  
  let energyProfile: 'building' | 'steady' | 'declining' | 'dynamic';
  const diff = lastThirdAvg - firstThirdAvg;
  
  if (Math.abs(diff) < 0.1) {
    energyProfile = 'steady';
  } else if (diff > 0.2) {
    energyProfile = 'building';
  } else if (diff < -0.2) {
    energyProfile = 'declining';
  } else {
    energyProfile = 'dynamic';
  }
  
  return { peakSection, avgEnergy, energyProfile };
};
