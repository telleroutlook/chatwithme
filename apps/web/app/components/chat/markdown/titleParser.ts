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
 */
export function generateFriendlyTitle(language: string, fallbackIndex: number): string {
  const extension = getLanguageExtension(language);
  const displayName = language.trim() || 'code';

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
