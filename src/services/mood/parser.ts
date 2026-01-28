import { MoodParameters } from '../../types/mood';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Parse mood using OpenAI
export const parseMoodWithAI = async (
  moodText: string,
  apiKey: string
): Promise<MoodParameters> => {
  const prompt = `Kullanıcı mood'u: "${moodText}"

Bu mood'u şu müzikal parametrelere dönüştür:
- energy (0.0-1.0): Enerji seviyesi
- valence (0.0-1.0): Pozitiflik/Negatiflik (0 = çok negatif, 1 = çok pozitif)
- danceability (0.0-1.0): Dans edilebilirlik
- acousticness (0.0-1.0): Akustik müzik tercihi (0 = elektronik, 1 = akustik)
- tempo_min: Minimum BPM (40-200 arası)
- tempo_max: Maximum BPM (40-200 arası)

Sadece JSON formatında cevap ver, başka bir şey yazma:
{"energy": 0.0, "valence": 0.0, "danceability": 0.0, "acousticness": 0.0, "tempo_min": 0, "tempo_max": 0}`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Sen bir müzik mood analiz asistanısın. Kullanıcının duygu durumunu müzikal parametrelere dönüştürüyorsun. Sadece JSON formatında cevap ver.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API request failed');
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate and normalize parameters
    return normalizeParameters(parsed);
  } catch (err) {
    console.error('OpenAI mood parsing failed:', err);
    throw err;
  }
};

// Normalize parameters to valid ranges
const normalizeParameters = (params: Record<string, number>): MoodParameters => {
  const clamp = (value: number, min: number, max: number): number => 
    Math.max(min, Math.min(max, value));

  return {
    energy: clamp(params.energy || 0.5, 0, 1),
    valence: clamp(params.valence || 0.5, 0, 1),
    danceability: clamp(params.danceability || 0.5, 0, 1),
    acousticness: clamp(params.acousticness || 0.5, 0, 1),
    tempo_min: clamp(params.tempo_min || 80, 40, 200),
    tempo_max: clamp(params.tempo_max || 120, 40, 200),
  };
};

// Parse context from conversation history
export const parseContextualMood = async (
  currentMood: string,
  history: string[],
  apiKey: string
): Promise<MoodParameters> => {
  const historyContext = history.length > 0 
    ? `Önceki mood'lar: ${history.slice(-3).join(', ')}. `
    : '';

  const contextualPrompt = `${historyContext}Şu anki mood: "${currentMood}"`;
  
  return parseMoodWithAI(contextualPrompt, apiKey);
};
