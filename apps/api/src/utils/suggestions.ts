import OpenAI from 'openai';

const FALLBACK_SUGGESTIONS = [
  '你能进一步展开关键步骤吗？',
  '如果要落地执行，第一步该做什么？',
  '这个方案有哪些风险和取舍？',
];

const MAX_CONTEXT_LENGTH = 2000;
const MAX_SUGGESTION_LENGTH = 80;

function clampText(text: string): string {
  return text.trim().slice(0, MAX_CONTEXT_LENGTH);
}

function normalizeSuggestion(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_SUGGESTION_LENGTH);
}

function extractContextKeywords(context: string): string[] {
  const normalized = context.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const matches =
    normalized.match(/[\u4e00-\u9fff]{2,10}|[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? [];
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

function buildContextualFallbackSuggestions(context: string): string[] {
  const keywords = extractContextKeywords(context);
  const target = keywords[0] || context.slice(0, 18).trim() || '这个问题';
  const second = keywords[1] || target;
  const third = keywords[2] || target;

  return [
    `关于「${target}」，你能分步骤展开说明吗？`,
    `如果要把「${second}」真正落地，第一步最该做什么？`,
    `在「${third}」这部分最容易踩的坑和取舍是什么？`,
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

  const start = cleaned.search(/[\[{]/);
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

function finalizeSuggestions(items: string[], context: string): string[] {
  const unique = dedupeSuggestions(items);
  if (unique.length >= 3) {
    return unique.slice(0, 3);
  }

  for (const fallback of buildContextualFallbackSuggestions(context)) {
    if (unique.length >= 3) break;
    const next = normalizeSuggestion(fallback);
    if (!unique.some((item) => item.toLowerCase() === next.toLowerCase())) {
      unique.push(next);
    }
  }

  for (const fallback of FALLBACK_SUGGESTIONS) {
    if (unique.length >= 3) break;
    const next = normalizeSuggestion(fallback);
    if (!unique.some((item) => item.toLowerCase() === next.toLowerCase())) {
      unique.push(next);
    }
  }

  return unique.slice(0, 3);
}

export function parseAndFinalizeSuggestions(raw: string, context: string): string[] {
  return finalizeSuggestions(parseJsonSuggestions(raw), clampText(context));
}

export async function generateFollowUpSuggestions(params: {
  openai: OpenAI;
  model: string;
  answerText: string;
}): Promise<string[]> {
  const context = clampText(params.answerText);
  if (!context) {
    return FALLBACK_SUGGESTIONS.slice(0, 3);
  }

  const prompt = `Based on the assistant response below, generate exactly 3 short and relevant follow-up questions the user is most likely to ask next.
Return ONLY JSON as either:
1) ["Q1","Q2","Q3"]
or
2) {"suggestions":["Q1","Q2","Q3"]}
Questions must be concise and directly tied to the response.

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
      temperature: 0.2,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
    };
    const completion = await params.openai.chat.completions.create(
      payload as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming
    );

    const raw = completion.choices[0]?.message?.content || '';
    return finalizeSuggestions(parseJsonSuggestions(raw), context);
  } catch (error) {
    console.warn('Suggestion generation failed, using fallback suggestions.', error);
    return finalizeSuggestions([], context);
  }
}

export function __test__parseAndFinalizeSuggestions(raw: string): string[] {
  return parseAndFinalizeSuggestions(raw, '测试上下文：AI agent workflow and deployment risk');
}
