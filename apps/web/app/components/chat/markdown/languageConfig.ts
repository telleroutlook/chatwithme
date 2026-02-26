/**
 * Language configuration for code blocks
 * Categorizes languages to determine default tab and preview behavior
 */

export type LanguageCategory = 'previewable' | 'plaintext' | 'programming' | 'mermaid';

export interface LanguageConfig {
  category: LanguageCategory;
  extension: string;
  displayName: string;
}

// Language to file extension mapping
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  ts: 'ts',
  python: 'py',
  py: 'py',
  java: 'java',
  go: 'go',
  rust: 'rs',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'c',
  csharp: 'cs',
  'c#': 'cs',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  xml: 'xml',
  svg: 'svg',
  markdown: 'md',
  md: 'md',
  yaml: 'yaml',
  yml: 'yml',
  sql: 'sql',
  shell: 'sh',
  bash: 'sh',
  sh: 'sh',
  powershell: 'ps1',
  ps1: 'ps1',
  php: 'php',
  ruby: 'rb',
  swift: 'swift',
  kotlin: 'kt',
  dart: 'dart',
  tsx: 'tsx',
  jsx: 'jsx',
  vue: 'vue',
  svelte: 'svelte',
};

// Language categories
const PREVIEWABLE_LANGUAGES = new Set(['html', 'htm', 'svg', 'xml', 'markdown', 'md']);

const PLAINTEXT_LANGUAGES = new Set(['txt', 'text', 'plain']);

const PROGRAMMING_LANGUAGES = new Set([
  'javascript',
  'js',
  'typescript',
  'ts',
  'python',
  'py',
  'java',
  'go',
  'rust',
  'cpp',
  'c++',
  'c',
  'csharp',
  'c#',
  'css',
  'scss',
  'sass',
  'less',
  'json',
  'yaml',
  'yml',
  'sql',
  'shell',
  'bash',
  'sh',
  'powershell',
  'ps1',
  'php',
  'ruby',
  'swift',
  'kotlin',
  'dart',
  'tsx',
  'jsx',
  'vue',
  'svelte',
]);

const MERMAID_LANGUAGES = new Set(['mermaid']);

/**
 * Get language configuration for a given language
 */
export function getLanguageConfig(language: string): LanguageConfig {
  const normalizedLang = language.toLowerCase().trim();

  // Determine category
  let category: LanguageCategory;
  if (MERMAID_LANGUAGES.has(normalizedLang)) {
    category = 'mermaid';
  } else if (PREVIEWABLE_LANGUAGES.has(normalizedLang)) {
    category = 'previewable';
  } else if (PLAINTEXT_LANGUAGES.has(normalizedLang)) {
    category = 'plaintext';
  } else if (PROGRAMMING_LANGUAGES.has(normalizedLang)) {
    category = 'programming';
  } else {
    // Default to programming for unknown languages
    category = 'programming';
  }

  // Get extension
  const extension = LANGUAGE_EXTENSIONS[normalizedLang] || 'txt';

  // Display name (capitalize first letter)
  const displayName = normalizedLang.charAt(0).toUpperCase() + normalizedLang.slice(1);

  return {
    category,
    extension,
    displayName,
  };
}

/**
 * Get file extension for a language
 */
export function getLanguageExtension(language: string): string {
  const normalizedLang = language.toLowerCase().trim();
  return LANGUAGE_EXTENSIONS[normalizedLang] || 'txt';
}

/**
 * Check if a language is previewable
 */
export function isPreviewableLanguage(language: string): boolean {
  const normalizedLang = language.toLowerCase().trim();
  return PREVIEWABLE_LANGUAGES.has(normalizedLang);
}

/**
 * Check if a language is plaintext
 */
export function isPlaintextLanguage(language: string): boolean {
  const normalizedLang = language.toLowerCase().trim();
  return PLAINTEXT_LANGUAGES.has(normalizedLang);
}

/**
 * Check if a language is a programming language
 */
export function isProgrammingLanguage(language: string): boolean {
  const normalizedLang = language.toLowerCase().trim();
  return PROGRAMMING_LANGUAGES.has(normalizedLang);
}

/**
 * Check if a language is mermaid
 */
export function isMermaidLanguage(language: string): boolean {
  const normalizedLang = language.toLowerCase().trim();
  return MERMAID_LANGUAGES.has(normalizedLang);
}
