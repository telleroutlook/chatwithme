import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MarkdownRenderer } from './index';
import { KatexRenderer } from './KatexBlock';

vi.mock('katex', () => {
  const render = (math: string, element: HTMLElement) => {
    element.innerHTML = `<span class="katex-mock">${math}</span>`;
  };
  return {
    render,
    default: { render },
  };
});

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, chart: string) => ({
      svg: `<svg data-testid="mermaid-svg"><text>${chart}</text></svg>`,
    })),
  },
}));

const waitForAsyncRender = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const waitForCondition = async (condition: () => boolean, timeoutMs = 1200): Promise<void> => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for render condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

describe('markdown rendering', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  const mount = (node: ReturnType<typeof createElement>): HTMLDivElement => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(node);
    return container;
  };

  afterEach(() => {
    if (root) {
      root.unmount();
      root = null;
    }
    if (container) {
      container.remove();
      container = null;
    }
  });

  it('renders formula via KaTeX renderer', async () => {
    const math = 'x^2 + y^2 = z^2';
    const el = mount(createElement(KatexRenderer, { math, inline: true }));
    await waitForCondition(() => (el.textContent || '').includes(math));
    expect(el.textContent).toContain(math);
  });

  it('renders svg code block with preview iframe', async () => {
    const content = ['```svg', '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>', '```'].join('\n');
    const el = mount(createElement(MarkdownRenderer, { content }));
    await waitForAsyncRender();
    expect(el.querySelector('iframe[title="Code Preview"]')).not.toBeNull();
    expect(el.querySelector('button[aria-label="View Preview"]')).not.toBeNull();
  });

  it('renders mermaid block to svg', async () => {
    const content = ['```mermaid', 'graph TD', 'A-->B', '```'].join('\n');
    const el = mount(createElement(MarkdownRenderer, { content }));
    await waitForCondition(() => el.querySelector('[data-testid="mermaid-svg"]') !== null);
    expect(el.querySelector('[data-testid="mermaid-svg"]')).not.toBeNull();
  });

  it('renders raw html document response with preview iframe', async () => {
    const content = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>demo</title></head>
<body><h1>HTML reply</h1></body>
</html>`;
    const el = mount(createElement(MarkdownRenderer, { content }));
    await waitForAsyncRender();
    expect(el.querySelector('iframe[title="Code Preview"]')).not.toBeNull();
    expect(el.textContent).toContain('html');
  });
});
