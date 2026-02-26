import { describe, expect, it } from 'vitest';
import { __test__parseAndFinalizeSuggestions, parseAndFinalizeSuggestions } from './suggestions';

describe('suggestions parser and finalizer', () => {
  it('parses plain JSON array', () => {
    const result = __test__parseAndFinalizeSuggestions(
      '["下一步怎么做？","可以给个示例吗？","有哪些风险？"]'
    );
    expect(result).toEqual(['下一步怎么做？', '可以给个示例吗？', '有哪些风险？']);
  });

  it('parses JSON wrapped in markdown code fence', () => {
    const result = __test__parseAndFinalizeSuggestions(
      '```json\n{"suggestions":["Q1","Q2","Q3"]}\n```'
    );
    expect(result).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('deduplicates and pads with fallback suggestions', () => {
    const result = __test__parseAndFinalizeSuggestions('["Q1","Q1"]');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('Q1');
  });

  it('falls back when payload is invalid', () => {
    const result = __test__parseAndFinalizeSuggestions('not-json');
    expect(result).toHaveLength(3);
    expect(
      result.some(
        (item) => item.includes('AI') || item.includes('workflow') || item.includes('risk')
      )
    ).toBe(true);
  });

  it('uses english fallback when user language hint is english', () => {
    const result = parseAndFinalizeSuggestions(
      'not-json',
      'This response is about deployment strategy and rollback plans.',
      'How should I roll this out safely?'
    );
    expect(result).toHaveLength(3);
    expect(result.every((item) => !/[\u4e00-\u9fff]/.test(item))).toBe(true);
  });
});
