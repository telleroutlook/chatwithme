import type { Message, MessageFile, SearchResult } from '@chatwithme/shared';

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asRole = (value: unknown): Message['role'] =>
  value === 'user' || value === 'assistant' ? value : 'assistant';

const asDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

const asMessageFiles = (value: unknown): MessageFile[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      url: asString(item.url),
      fileName: asString(item.fileName),
      mimeType: asString(item.mimeType, 'application/octet-stream'),
      size: typeof item.size === 'number' ? item.size : 0,
      extractedText: typeof item.extractedText === 'string' ? item.extractedText : undefined,
    }));
};

const asSearchResults = (value: unknown): SearchResult[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      title: asString(item.title),
      url: asString(item.url),
      snippet: asString(item.snippet),
    }));
};

export function sanitizeMessage(input: unknown): Message | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const id = asString(raw.id);
  const conversationId = asString(raw.conversationId);
  if (!id || !conversationId) return null;

  return {
    id,
    userId: asString(raw.userId),
    conversationId,
    role: asRole(raw.role),
    message: asString(raw.message),
    files: asMessageFiles(raw.files),
    generatedImageUrls: Array.isArray(raw.generatedImageUrls)
      ? raw.generatedImageUrls.filter((item): item is string => typeof item === 'string')
      : [],
    searchResults: asSearchResults(raw.searchResults),
    suggestions: Array.isArray(raw.suggestions)
      ? raw.suggestions.filter((item): item is string => typeof item === 'string')
      : undefined,
    createdAt: asDate(raw.createdAt),
  };
}

export function sanitizeMessages(input: unknown): Message[] {
  if (!Array.isArray(input)) return [];
  return input.map(sanitizeMessage).filter((item): item is Message => item !== null);
}
