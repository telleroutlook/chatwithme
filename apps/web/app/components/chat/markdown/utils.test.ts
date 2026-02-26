import { describe, expect, it } from 'vitest';
import { normalizeMarkdownContent, hasBalancedHtmlTags, isPreviewCodeComplete } from './utils';
import { sanitizeFileName } from '~/lib/utils';
import { parseCodeBlockTitle, countLines, inferTitleFromContext, generateFriendlyTitle } from './titleParser';
import { getDefaultTab } from './tabSelector';
import { getLanguageConfig } from './languageConfig';
import type { CodeBlockTab } from './types';

describe('normalizeMarkdownContent', () => {
  it('wraps a full html document in a fenced html block', () => {
    const input = `<!DOCTYPE html>
<html>
  <head><title>Demo</title></head>
  <body><h1>Hello</h1></body>
</html>`;

    const output = normalizeMarkdownContent(input);
    expect(output.startsWith('```html\n')).toBe(true);
    expect(output.endsWith('\n```')).toBe(true);
  });

  it('keeps existing fenced code blocks unchanged', () => {
    const input = '```html\\n<html><body>demo</body></html>\\n```';
    expect(normalizeMarkdownContent(input)).toBe(input);
  });

  it('keeps normal markdown unchanged', () => {
    const input = '# title\n\nplain text';
    expect(normalizeMarkdownContent(input)).toBe(input);
  });
});

describe('hasBalancedHtmlTags', () => {
  it('returns true for balanced HTML', () => {
    expect(hasBalancedHtmlTags('<div><p>Hello</p></div>')).toBe(true);
  });

  it('returns false for unbalanced HTML', () => {
    expect(hasBalancedHtmlTags('<div><p>Hello</div>')).toBe(false);
  });

  it('handles self-closing tags', () => {
    expect(hasBalancedHtmlTags('<div><img src="test.jpg" /></div>')).toBe(true);
  });

  it('handles void tags', () => {
    expect(hasBalancedHtmlTags('<div><br></div>')).toBe(true);
  });
});

describe('isPreviewCodeComplete', () => {
  it('returns false for empty code', () => {
    expect(isPreviewCodeComplete('', false)).toBe(false);
  });

  it('returns false for incomplete HTML', () => {
    expect(isPreviewCodeComplete('<div>hello', false)).toBe(false);
  });

  it('returns true for complete HTML', () => {
    // Need to meet minimum length requirements (3 lines or 100 chars)
    const html = '<div>hello</div>\n<p>This is a longer text to meet the minimum character requirement for preview.</p>\n<span>More content here</span>';
    expect(isPreviewCodeComplete(html, false)).toBe(true);
  });

  it('returns true for complete SVG', () => {
    expect(isPreviewCodeComplete('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>', true)).toBe(true);
  });

  it('returns false for incomplete SVG', () => {
    expect(isPreviewCodeComplete('<svg><circle cx="50"', true)).toBe(false);
  });

  it('applies length limits for non-SVG code', () => {
    expect(isPreviewCodeComplete('<p>a</p>', false)).toBe(false);
  });
});

describe('sanitizeFileName', () => {
  it('removes dangerous characters', () => {
    expect(sanitizeFileName('file<>:"/\\|?*name.txt')).toBe('filename.txt');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeFileName('my file name.txt')).toBe('my_file_name.txt');
  });

  it('limits length to 255 characters', () => {
    const longName = 'a'.repeat(300) + '.txt';
    const result = sanitizeFileName(longName);
    expect(result.length).toBeLessThanOrEqual(255);
  });

  it('preserves file extension when truncating', () => {
    const longName = 'a'.repeat(260) + '.txt';
    const result = sanitizeFileName(longName);
    expect(result).toMatch(/\.txt$/);
  });

  it('returns default name for empty input', () => {
    expect(sanitizeFileName('')).toBe('file.txt');
  });

  it('removes leading and trailing dots', () => {
    expect(sanitizeFileName('...test...')).toBe('test');
  });
});

describe('parseCodeBlockTitle', () => {
  it('parses language:filename.ext format', () => {
    const result = parseCodeBlockTitle('typescript:utils.ts', 'code');
    expect(result.filename).toBe('utils.ts');
    expect(result.isExplicit).toBe(true);
  });

  it('parses language [filename] format', () => {
    const result = parseCodeBlockTitle('html [index.html]', 'code');
    expect(result.filename).toBe('index.html');
    expect(result.isExplicit).toBe(true);
  });

  it('parses language (filename) format', () => {
    const result = parseCodeBlockTitle('python (script.py)', 'code');
    expect(result.filename).toBe('script.py');
    expect(result.isExplicit).toBe(true);
  });

  it('generates default filename when no explicit format', () => {
    const result = parseCodeBlockTitle('typescript', 'code');
    expect(result.filename).toBe('code_snippet.ts');
    expect(result.isExplicit).toBe(false);
  });
});

describe('countLines', () => {
  it('counts lines correctly', () => {
    expect(countLines('line1\nline2\nline3')).toBe(3);
  });

  it('handles empty string', () => {
    expect(countLines('')).toBe(0);
  });

  it('handles single line', () => {
    expect(countLines('single line')).toBe(1);
  });
});

describe('inferTitleFromContext', () => {
  it('infers filename from "Create file:" pattern', () => {
    const context = 'Create file: utils.ts\n```typescript\ncode\n```';
    expect(inferTitleFromContext(context)).toBe('utils.ts');
  });

  it('infers filename from "File:" pattern', () => {
    const context = 'File: index.html\n```html\ncode\n```';
    expect(inferTitleFromContext(context)).toBe('index.html');
  });

  it('returns null for no pattern match', () => {
    const context = 'Just some text here';
    expect(inferTitleFromContext(context)).toBeNull();
  });
});

describe('generateFriendlyTitle', () => {
  it('generates title with fallback index 0', () => {
    expect(generateFriendlyTitle('typescript', 0)).toBe('code_snippet.ts');
  });

  it('generates title with fallback index > 0', () => {
    expect(generateFriendlyTitle('python', 2)).toBe('code_snippet_3.py');
  });
});

describe('getDefaultTab', () => {
  it('returns preview for previewable content with ready preview', () => {
    const tab = getDefaultTab({
      category: 'previewable',
      lineCount: 10,
      isPreviewReady: true,
      viewportWidth: 1200,
    });
    expect(tab).toBe('preview');
  });

  it('returns title for long code blocks on desktop', () => {
    const tab = getDefaultTab({
      category: 'programming',
      lineCount: 60,
      isPreviewReady: false,
      viewportWidth: 1200,
    });
    expect(tab).toBe('title');
  });

  it('returns code for short code blocks', () => {
    const tab = getDefaultTab({
      category: 'programming',
      lineCount: 10,
      isPreviewReady: false,
      viewportWidth: 1200,
    });
    expect(tab).toBe('code');
  });

  it('returns title for programming on mobile', () => {
    const tab = getDefaultTab({
      category: 'programming',
      lineCount: 20,
      isPreviewReady: false,
      viewportWidth: 500,
    });
    expect(tab).toBe('title');
  });

  it('returns code for plaintext', () => {
    const tab = getDefaultTab({
      category: 'plaintext',
      lineCount: 100,
      isPreviewReady: false,
      viewportWidth: 1200,
    });
    expect(tab).toBe('code');
  });
});

describe('getLanguageConfig', () => {
  it('returns correct config for JavaScript', () => {
    const config = getLanguageConfig('javascript');
    expect(config.category).toBe('programming');
    expect(config.extension).toBe('js');
    expect(config.displayName).toBe('Javascript');
  });

  it('returns correct config for HTML', () => {
    const config = getLanguageConfig('html');
    expect(config.category).toBe('previewable');
    expect(config.extension).toBe('html');
    expect(config.displayName).toBe('Html');
  });

  it('returns correct config for SVG', () => {
    const config = getLanguageConfig('svg');
    expect(config.category).toBe('previewable');
    expect(config.extension).toBe('svg');
  });

  it('returns correct config for plaintext', () => {
    const config = getLanguageConfig('txt');
    expect(config.category).toBe('plaintext');
    expect(config.extension).toBe('txt');
  });

  it('returns correct config for mermaid', () => {
    const config = getLanguageConfig('mermaid');
    expect(config.category).toBe('mermaid');
    expect(config.extension).toBe('txt');
  });

  it('defaults to programming for unknown languages', () => {
    const config = getLanguageConfig('unknownlang');
    expect(config.category).toBe('programming');
    expect(config.extension).toBe('txt');
  });
});
