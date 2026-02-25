import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Suspense, lazy } from 'react';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { cn } from '~/lib/utils';
import { extractText, normalizeMarkdownContent } from './utils';
import { KatexRenderer } from './KatexBlock';
import { CodeBlockWithPreview } from './CodeBlock';
import type { MarkdownRendererProps } from './types';

const LazyMermaidRenderer = lazy(() =>
  import('./MermaidBlock').then((m) => ({ default: m.MermaidRenderer }))
);

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const normalizedContent = normalizeMarkdownContent(content);

  return (
    <div className={cn('prose prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: (props) => {
            const { className, children, ...restProps } = props;
            const inline = 'inline' in props && Boolean((props as { inline?: boolean }).inline);
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const rawText = extractText(children).replace(/\n$/, '');
            const isMathInline = (className || '').includes('math-inline');
            const isMathDisplay = (className || '').includes('math-display');
            const isMath = language.toLowerCase() === 'math' || isMathInline || isMathDisplay;

            if (isMath) {
              return <KatexRenderer math={rawText} inline={inline || isMathInline} />;
            }

            const isBlock = !inline && (!!match || rawText.includes('\n'));
            const isMermaid = language.toLowerCase() === 'mermaid';

            if (isBlock && isMermaid) {
              return (
                <Suspense fallback={<div className="text-sm text-muted-foreground">Loading Mermaid...</div>}>
                  <LazyMermaidRenderer chart={rawText} />
                </Suspense>
              );
            }

            if (isBlock) {
              return (
                <CodeBlockWithPreview className={className} language={language}>
                  {children}
                </CodeBlockWithPreview>
              );
            }

            return (
              <code
                className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
                {...restProps}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
