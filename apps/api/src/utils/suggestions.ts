import OpenAI from 'openai';

const ZH_FALLBACK_SUGGESTIONS = [
  '你能进一步展开关键步骤吗？',
  '如果要落地执行，第一步该做什么？',
  '这个方案有哪些风险和取舍？',
];

const EN_FALLBACK_SUGGESTIONS = [
  'Can you break down the key steps in more detail?',
  'If I want to implement this, what should I do first?',
  'What are the main risks and trade-offs in this approach?',
];

const MAX_CONTEXT_LENGTH = 2000;
const MAX_SUGGESTION_LENGTH = 80;
type SuggestionLanguage = 'zh' | 'en';

function clampText(text: string): string {
  return text.trim().slice(0, MAX_CONTEXT_LENGTH);
}

function normalizeSuggestion(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_SUGGESTION_LENGTH);
}

function detectSuggestionLanguage(text: string): SuggestionLanguage {
  const zhMatches = text.match(/[\u4e00-\u9fff]/g) ?? [];
  return zhMatches.length > 0 ? 'zh' : 'en';
}

function extractContextKeywords(context: string): string[] {
  const normalized = context.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const matches = normalized.match(/[\u4e00-\u9fff]{2,10}|[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? [];
  const stopwords = new Set([
    '这个',
    '那个',
    '以及',
    '然后',
    '可以',
    '需要',
    '通过',
    '如果',
    '因为',
    '所以',
    'assistant',
    'response',
  ]);
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const raw of matches) {
    const candidate = raw.trim();
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (stopwords.has(candidate) || stopwords.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
    if (unique.length >= 3) break;
  }

  return unique;
}

function buildContextualFallbackSuggestions(
  context: string,
  language: SuggestionLanguage
): string[] {
  const keywords = extractContextKeywords(context);
  const target =
    keywords[0] ||
    context.slice(0, language === 'zh' ? 18 : 28).trim() ||
    (language === 'zh' ? '这个问题' : 'this topic');
  const second = keywords[1] || target;
  const third = keywords[2] || target;

  if (language === 'zh') {
    return [
      `关于「${target}」，你能分步骤展开说明吗？`,
      `如果要把「${second}」真正落地，第一步最该做什么？`,
      `在「${third}」这部分最容易踩的坑和取舍是什么？`,
    ].map(normalizeSuggestion);
  }

  return [
    `Can you explain "${target}" step by step?`,
    `If I want to put "${second}" into practice, what should I start with?`,
    `What are the common pitfalls and trade-offs around "${third}"?`,
  ].map(normalizeSuggestion);
}

function parseJsonSuggestions(raw: string): string[] {
  const cleaned = raw.trim();
  if (!cleaned) return [];

  const parseAsList = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    if (typeof value === 'object' && value !== null) {
      const maybeSuggestions = (value as { suggestions?: unknown }).suggestions;
      if (Array.isArray(maybeSuggestions)) {
        return maybeSuggestions.filter((item): item is string => typeof item === 'string');
      }
    }
    return [];
  };

  try {
    return parseAsList(JSON.parse(cleaned));
  } catch {
    // ignore
  }

  try {
    const withoutCodeFence = cleaned
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    return parseAsList(JSON.parse(withoutCodeFence));
  } catch {
    // ignore
  }

  const start = cleaned.search(/[{[]/);
  const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
  if (start !== -1 && end > start) {
    try {
      return parseAsList(JSON.parse(cleaned.slice(start, end + 1)));
    } catch {
      // ignore
    }
  }

  return [];
}

function dedupeSuggestions(items: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const normalized = normalizeSuggestion(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}

function finalizeSuggestions(items: string[], context: string, languageHint: string): string[] {
  const unique = dedupeSuggestions(items);
  const language = detectSuggestionLanguage(`${languageHint}\n${context}`);
  const fallbackSuggestions = language === 'zh' ? ZH_FALLBACK_SUGGESTIONS : EN_FALLBACK_SUGGESTIONS;
  if (unique.length >= 3) {
    return unique.slice(0, 3);
  }

  for (const fallback of buildContextualFallbackSuggestions(context, language)) {
    if (unique.length >= 3) break;
    const next = normalizeSuggestion(fallback);
    if (!unique.some((item) => item.toLowerCase() === next.toLowerCase())) {
      unique.push(next);
    }
  }

  for (const fallback of fallbackSuggestions) {
    if (unique.length >= 3) break;
    const next = normalizeSuggestion(fallback);
    if (!unique.some((item) => item.toLowerCase() === next.toLowerCase())) {
      unique.push(next);
    }
  }

  return unique.slice(0, 3);
}

export function parseAndFinalizeSuggestions(
  raw: string,
  context: string,
  languageHint: string = context
): string[] {
  return finalizeSuggestions(
    parseJsonSuggestions(raw),
    clampText(context),
    clampText(languageHint)
  );
}

export async function generateFollowUpSuggestions(params: {
  openai: OpenAI;
  model: string;
  answerText: string;
  userMessage?: string;
  env?: {
    // Add env parameter for configuration
    CHAT_TEMPERATURE?: string;
    CHAT_MAX_TOKENS?: string;
    CHAT_TOP_P?: string;
    CHAT_THINKING_ENABLED?: string;
  };
}): Promise<string[]> {
  const context = clampText(params.answerText);
  const languageHint = clampText(params.userMessage || context);
  const language = detectSuggestionLanguage(languageHint);
  if (!context) {
    return (language === 'zh' ? ZH_FALLBACK_SUGGESTIONS : EN_FALLBACK_SUGGESTIONS).slice(0, 3);
  }

  const prompt = `Based on the user question and assistant response below, generate exactly 3 short and relevant follow-up questions the user is most likely to ask next.
Return ONLY JSON as either:
1) ["Q1","Q2","Q3"]
or
2) {"suggestions":["Q1","Q2","Q3"]}
Questions must be concise and directly tied to the response.
Use the same language as the user question.

User question:
${languageHint}

Assistant response:
${context}`;

  try {
    const payload: Record<string, unknown> = {
      model: params.model,
      messages: [
        {
          role: 'system',
          content: 'You generate concise follow-up question suggestions in strict JSON format.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    };

    // Use configured temperature for suggestions (lower is better for deterministic suggestions)
    if (params.env?.CHAT_TEMPERATURE !== undefined) {
      // Use half of the configured temperature for suggestions to be more deterministic
      payload.temperature = Math.max(0.1, parseFloat(params.env.CHAT_TEMPERATURE) * 0.4);
    } else {
      payload.temperature = 0.2;
    }

    // Use configured max_tokens for suggestions (suggestions don't need many tokens)
    if (params.env?.CHAT_MAX_TOKENS !== undefined) {
      const maxTokens = parseInt(params.env.CHAT_MAX_TOKENS, 10);
      payload.max_tokens = Math.min(500, maxTokens); // Cap at 500 for suggestions
    } else {
      payload.max_tokens = 200;
    }

    // Use configured top_p
    if (params.env?.CHAT_TOP_P !== undefined) {
      payload.top_p = parseFloat(params.env.CHAT_TOP_P);
    }

    // Use configured thinking parameter
    if (params.env?.CHAT_THINKING_ENABLED !== undefined) {
      const thinkingEnabled =
        params.env.CHAT_THINKING_ENABLED === 'true' || params.env.CHAT_THINKING_ENABLED === '1';
      payload.thinking = { type: thinkingEnabled ? 'enabled' : 'disabled' };
    } else {
      payload.thinking = { type: 'disabled' };
    }

    const completion = await params.openai.chat.completions.create(
      payload as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming
    );

    const raw = completion.choices[0]?.message?.content || '';
    return finalizeSuggestions(parseJsonSuggestions(raw), context, languageHint);
  } catch (error) {
    console.warn('Suggestion generation failed, using fallback suggestions.', error);
    return finalizeSuggestions([], context, languageHint);
  }
}

export function __test__parseAndFinalizeSuggestions(raw: string): string[] {
  return parseAndFinalizeSuggestions(raw, '测试上下文：AI agent workflow and deployment risk');
}
