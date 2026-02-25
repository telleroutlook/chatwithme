import { describe, expect, it } from 'vitest';
import { normalizeMarkdownContent } from './utils';

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
