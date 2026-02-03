// Context Window - Track recent mood inputs and patterns

const CONTEXT_KEY = 'moodverter_mood_context';
const MAX_CONTEXT_SIZE = 20;

export interface MoodContext {
  input: string;
  category: string;
  timestamp: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number; // 0-6
}

export interface PatternInsight {
  pattern: string;
  confidence: number;
  suggestion: string;
}

// In-memory context
let contextWindow: MoodContext[] = [];

// =============================================================================
// Persistence
// =============================================================================

function loadContext(): void {
  try {
    const stored = localStorage.getItem(CONTEXT_KEY);
    if (stored) {
      contextWindow = JSON.parse(stored);
    }
  } catch {
    contextWindow = [];
  }
}

function saveContext(): void {
  try {
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(contextWindow));
  } catch {
    // Ignore
  }
}

// Initialize
loadContext();

// =============================================================================
// Public API
// =============================================================================

/**
 * Add a mood input to the context window
 */
export function addMoodContext(input: string, category: string): void {
  const now = new Date();
  const hour = now.getHours();

  const context: MoodContext = {
    input,
    category,
    timestamp: now.getTime(),
    timeOfDay: getTimeOfDay(hour),
    dayOfWeek: now.getDay(),
  };

  contextWindow.push(context);

  // Keep only recent contexts
  if (contextWindow.length > MAX_CONTEXT_SIZE) {
    contextWindow = contextWindow.slice(-MAX_CONTEXT_SIZE);
  }

  saveContext();
}

/**
 * Get the current context window
 */
export function getContextWindow(): MoodContext[] {
  return [...contextWindow];
}

/**
 * Get recent contexts (last N)
 */
export function getRecentContexts(count: number = 5): MoodContext[] {
  return contextWindow.slice(-count);
}

/**
 * Detect patterns in mood usage
 */
export function detectPatterns(): PatternInsight[] {
  const insights: PatternInsight[] = [];

  if (contextWindow.length < 5) {
    return insights;
  }

  // Time-based patterns
  const timePatterns = analyzeTimePatterns();
  insights.push(...timePatterns);

  // Day-based patterns
  const dayPatterns = analyzeDayPatterns();
  insights.push(...dayPatterns);

  // Sequence patterns
  const sequencePatterns = analyzeSequencePatterns();
  insights.push(...sequencePatterns);

  return insights;
}

/**
 * Get suggested mood based on current time and patterns
 */
export function getSuggestedMood(): string | null {
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = getTimeOfDay(hour);
  const dayOfWeek = now.getDay();

  // Find most common mood for this time/day
  const relevantContexts = contextWindow.filter(c =>
    c.timeOfDay === timeOfDay || c.dayOfWeek === dayOfWeek
  );

  if (relevantContexts.length < 3) {
    return null;
  }

  // Count mood frequencies
  const moodCounts = new Map<string, number>();
  for (const ctx of relevantContexts) {
    const count = moodCounts.get(ctx.category) || 0;
    moodCounts.set(ctx.category, count + 1);
  }

  // Find most common
  let maxCount = 0;
  let suggestedMood: string | null = null;

  moodCounts.forEach((count, mood) => {
    if (count > maxCount) {
      maxCount = count;
      suggestedMood = mood;
    }
  });

  // Only suggest if pattern is strong enough
  if (maxCount >= 2 && maxCount / relevantContexts.length >= 0.4) {
    return suggestedMood;
  }

  return null;
}

/**
 * Clear context window
 */
export function clearContext(): void {
  contextWindow = [];
  localStorage.removeItem(CONTEXT_KEY);
}

// =============================================================================
// Pattern Analysis
// =============================================================================

function getTimeOfDay(hour: number): MoodContext['timeOfDay'] {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function analyzeTimePatterns(): PatternInsight[] {
  const insights: PatternInsight[] = [];

  const timeGroups = new Map<string, Map<string, number>>();

  for (const ctx of contextWindow) {
    if (!timeGroups.has(ctx.timeOfDay)) {
      timeGroups.set(ctx.timeOfDay, new Map());
    }

    const moodCounts = timeGroups.get(ctx.timeOfDay)!;
    const count = moodCounts.get(ctx.category) || 0;
    moodCounts.set(ctx.category, count + 1);
  }

  // Find dominant moods for each time
  timeGroups.forEach((moodCounts, timeOfDay) => {
    let maxCount = 0;
    let dominantMood = '';

    moodCounts.forEach((count, mood) => {
      if (count > maxCount) {
        maxCount = count;
        dominantMood = mood;
      }
    });

    if (maxCount >= 3) {
      const totalForTime = Array.from(moodCounts.values()).reduce((a, b) => a + b, 0);
      const confidence = maxCount / totalForTime;

      if (confidence >= 0.5) {
        const timeLabels: Record<string, string> = {
          morning: 'sabahları',
          afternoon: 'öğleden sonra',
          evening: 'akşamları',
          night: 'gece',
        };

        insights.push({
          pattern: `${timeLabels[timeOfDay] || timeOfDay} ${dominantMood}`,
          confidence,
          suggestion: `${dominantMood} mood için ${timeLabels[timeOfDay]} tercih ediyorsun`,
        });
      }
    }
  });

  return insights;
}

function analyzeDayPatterns(): PatternInsight[] {
  const insights: PatternInsight[] = [];

  // Group by weekend vs weekday
  const weekdayMoods = new Map<string, number>();
  const weekendMoods = new Map<string, number>();

  for (const ctx of contextWindow) {
    const isWeekend = ctx.dayOfWeek === 0 || ctx.dayOfWeek === 6;
    const moodCounts = isWeekend ? weekendMoods : weekdayMoods;

    const count = moodCounts.get(ctx.category) || 0;
    moodCounts.set(ctx.category, count + 1);
  }

  // Check for weekend pattern
  if (weekendMoods.size > 0) {
    let maxCount = 0;
    let dominantMood = '';

    weekendMoods.forEach((count, mood) => {
      if (count > maxCount) {
        maxCount = count;
        dominantMood = mood;
      }
    });

    if (maxCount >= 2) {
      insights.push({
        pattern: `hafta sonu ${dominantMood}`,
        confidence: 0.6,
        suggestion: `Hafta sonları ${dominantMood} tercih ediyorsun`,
      });
    }
  }

  return insights;
}

function analyzeSequencePatterns(): PatternInsight[] {
  const insights: PatternInsight[] = [];

  if (contextWindow.length < 4) {
    return insights;
  }

  // Look for A -> B patterns
  const transitions = new Map<string, Map<string, number>>();

  for (let i = 1; i < contextWindow.length; i++) {
    const prev = contextWindow[i - 1].category;
    const curr = contextWindow[i].category;

    // Only count if within same session (2 hours)
    const timeDiff = contextWindow[i].timestamp - contextWindow[i - 1].timestamp;
    if (timeDiff > 2 * 60 * 60 * 1000) continue;

    if (!transitions.has(prev)) {
      transitions.set(prev, new Map());
    }

    const nextCounts = transitions.get(prev)!;
    const count = nextCounts.get(curr) || 0;
    nextCounts.set(curr, count + 1);
  }

  // Find common transitions
  transitions.forEach((nextCounts, from) => {
    let maxCount = 0;
    let likelyNext = '';

    nextCounts.forEach((count, to) => {
      if (count > maxCount && from !== to) {
        maxCount = count;
        likelyNext = to;
      }
    });

    if (maxCount >= 2) {
      insights.push({
        pattern: `${from} sonrası ${likelyNext}`,
        confidence: 0.5,
        suggestion: `${from} sonrası genellikle ${likelyNext} istiyorsun`,
      });
    }
  });

  return insights;
}
