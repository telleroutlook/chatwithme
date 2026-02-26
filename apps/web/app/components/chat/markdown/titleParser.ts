/**
 * Title parser for code blocks
 * Extracts and infers filenames from code block metadata
 */

import { getLanguageExtension } from './languageConfig';

export interface ParsedTitle {
  filename: string;
  displayName: string;
  isExplicit: boolean;
}

/**
 * Sanitize extracted text for use as filename
 * Removes/replaces characters that are invalid in filenames
 */
function sanitizeFilename(text: string): string {
  return (
    text
      .trim()
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // Remove invalid chars
      .replace(/\s+/g, '_') // Spaces to underscores
      .replace(/_{2,}/g, '_') // Multiple underscores to single
      .replace(/^_+|_+$/g, '') // Trim leading/trailing underscores
      .substring(0, 60) // Limit length
  );
}

/**
 * Extract meaningful title from SVG content
 * Priority: <title> tag -> first <text> element
 */
function extractSvgTitle(rawCode: string): string | null {
  const trimmedCode = rawCode.trim();

  // Try to extract <title> tag content
  const titleMatch = trimmedCode.match(/<title[^>]*>(.*?)<\/title>/is);
  if (titleMatch && titleMatch[1]) {
    const title = titleMatch[1]
      .trim()
      .replace(/[\s\n\r]+/g, ' ') // Normalize whitespace
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename chars
      .substring(0, 50); // Limit length
    if (title.length > 2) {
      return title;
    }
  }

  // Try to extract first <text> element content (often the main heading in SVG)
  const textMatch = trimmedCode.match(/<text[^>]*>(.*?)<\/text>/is);
  if (textMatch && textMatch[1]) {
    const text = textMatch[1]
      .trim()
      .replace(/[\s\n\r]+/g, ' ')
      .replace(/[<>:"/\\|?*]/g, '')
      .substring(0, 50);
    if (text.length > 2) {
      return text;
    }
  }

  return null;
}

/**
 * Extract meaningful title from Markdown content
 * Priority: first # heading -> first non-empty line
 */
function extractMarkdownTitle(rawCode: string): string | null {
  const lines = rawCode.trim().split('\n');

  // Try to find first # heading
  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch && headingMatch[1]) {
      const title = headingMatch[1].trim();
      if (title.length > 2) {
        return title;
      }
    }
  }

  // Fall back to first non-empty, non-special line
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines, code fences, frontmatter separators
    if (trimmed && !trimmed.startsWith('```') && !trimmed.startsWith('---')) {
      if (trimmed.length > 2 && trimmed.length < 100) {
        return trimmed.substring(0, 60);
      }
    }
  }

  return null;
}

/**
 * Extract meaningful title from plain text content
 * Uses first meaningful line
 */
function extractTextTitle(rawCode: string): string | null {
  const lines = rawCode.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines, common prefixes
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
      if (trimmed.length > 2 && trimmed.length < 100) {
        return trimmed;
      }
    }
  }

  return null;
}

/**
 * Extract meaningful title from HTML content
 * Priority: <title> tag -> <h1> tag -> first heading
 */
function extractHtmlTitle(rawCode: string): string | null {
  const trimmedCode = rawCode.trim();

  // Try <title> tag
  const titleMatch = trimmedCode.match(/<title[^>]*>(.*?)<\/title>/is);
  if (titleMatch && titleMatch[1]) {
    const title = titleMatch[1].trim().replace(/\s+/g, ' ');
    if (title.length > 2) {
      return title;
    }
  }

  // Try <h1> tag
  const h1Match = trimmedCode.match(/<h1[^>]*>(.*?)<\/h1>/is);
  if (h1Match && h1Match[1]) {
    const title = h1Match[1].trim().replace(/\s+/g, ' ');
    if (title.length > 2) {
      return title;
    }
  }

  // Try any heading tag
  const headingMatch = trimmedCode.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/is);
  if (headingMatch && headingMatch[1]) {
    const title = headingMatch[1].trim().replace(/\s+/g, ' ');
    if (title.length > 2) {
      return title;
    }
  }

  return null;
}

/**
 * Infer meaningful title from code content based on language
 */
function inferTitleFromContent(language: string, rawCode: string): string | null {
  if (!rawCode || rawCode.length < 10) return null;

  const lowerLanguage = language.toLowerCase();

  // SVG content
  if (lowerLanguage === 'svg' || rawCode.trim().startsWith('<svg')) {
    return extractSvgTitle(rawCode);
  }

  // Markdown content
  if (lowerLanguage === 'md' || lowerLanguage === 'markdown') {
    return extractMarkdownTitle(rawCode);
  }

  // HTML content
  if (lowerLanguage === 'html') {
    return extractHtmlTitle(rawCode);
  }

  // Plain text
  if (lowerLanguage === 'txt' || lowerLanguage === 'text') {
    return extractTextTitle(rawCode);
  }

  return null;
}

/**
 * Parse code block title from language string
 * Supports formats:
 * - `language:filename.ext` (e.g., `typescript:utils.ts`)
 * - `language [filename]` (e.g., `html [index.html]`)
 * - `language (filename)` (e.g., `python (script.py)`)
 */
export function parseCodeBlockTitle(language: string, rawCode: string): ParsedTitle {
  const trimmedLanguage = language.trim();

  // Format 1: `language:filename.ext`
  const colonMatch = trimmedLanguage.match(/^[\w-]+:(.+)$/i);
  if (colonMatch) {
    const filename = colonMatch[1].trim();
    return {
      filename,
      displayName: filename,
      isExplicit: true,
    };
  }

  // Format 2: `language [filename]`
  const bracketMatch = trimmedLanguage.match(/^[\w-]+\s+\[(.+)\]$/i);
  if (bracketMatch) {
    const filename = bracketMatch[1].trim();
    return {
      filename,
      displayName: filename,
      isExplicit: true,
    };
  }

  // Format 3: `language (filename)`
  const parenMatch = trimmedLanguage.match(/^[\w-]+\s+\((.+)\)$/i);
  if (parenMatch) {
    const filename = parenMatch[1].trim();
    return {
      filename,
      displayName: filename,
      isExplicit: true,
    };
  }

  // Try to infer a meaningful title from the content itself
  const inferredTitle = inferTitleFromContent(language, rawCode);
  if (inferredTitle) {
    const extension = getLanguageExtension(language);
    const sanitized = sanitizeFilename(inferredTitle);
    if (sanitized) {
      return {
        filename: `${sanitized}.${extension}`,
        displayName: sanitized,
        isExplicit: false,
      };
    }
  }

  // No explicit filename found, generate a friendly one
  const extension = getLanguageExtension(language);
  return {
    filename: `code_snippet.${extension}`,
    displayName: language || 'code',
    isExplicit: false,
  };
}

/**
 * Infer filename from context text
 * Looks for patterns like:
 * - `Create file: xxx.ext`
 * - `File: xxx.ext`
 * - `// file: xxx.ext` (code comment)
 */
export function inferTitleFromContext(context: string): string | null {
  if (!context) return null;

  const patterns = [
    /(?:create|new)\s+file:\s*([^\s\n]+\.\w+)/i,
    /file:\s*([^\s\n]+\.\w+)/i,
    /\/\/\s*file:\s*([^\s\n]+\.\w+)/i,
    /#\s*file:\s*([^\s\n]+\.\w+)/i,
    /\*\s*file:\s*([^\s\n]+\.\w+)/i,
  ];

  for (const pattern of patterns) {
    const match = context.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Generate a friendly title for code without explicit filename
 * @deprecated Use parseCodeBlockTitle instead, which now handles content-based inference
 */
export function generateFriendlyTitle(
  language: string,
  fallbackIndex: number,
  rawCode?: string
): string {
  const extension = getLanguageExtension(language);

  // If rawCode is provided, try to extract a meaningful title
  if (rawCode) {
    const inferredTitle = inferTitleFromContent(language, rawCode);
    if (inferredTitle) {
      const sanitized = sanitizeFilename(inferredTitle);
      if (sanitized) {
        return `${sanitized}.${extension}`;
      }
    }
  }

  if (fallbackIndex === 0) {
    return `code_snippet.${extension}`;
  }

  return `code_snippet_${fallbackIndex + 1}.${extension}`;
}

/**
 * Count lines in code
 */
export function countLines(code: string): number {
  if (!code) return 0;
  return code.split('\n').length;
}
