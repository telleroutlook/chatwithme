import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Suspense, lazy, memo } from 'react';
import 'katex/dist/katex.min.css';
import { cn } from '~/lib/utils';
import { extractText, normalizeMarkdownContent } from './utils';
import { KatexRenderer } from './KatexBlock';
import { CodeBlockWithPreview } from './CodeBlock';
import { CodeHighlightTheme } from './CodeHighlightTheme';
import type { MarkdownRendererProps } from './types';
import { Loader2 } from 'lucide-react';

const LazyMermaidRenderer = lazy(() =>
  import('./MermaidBlock').then((m) => ({ default: m.MermaidRenderer }))
);

export const MarkdownRenderer = memo<MarkdownRendererProps>(({ content, className }) => {
  const normalizedContent = normalizeMarkdownContent(content);

  return (
    <div className={cn('prose prose-invert max-w-none', className)}>
      <CodeHighlightTheme />
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
                <Suspense
                  fallback={
                    <div className="my-4 rounded-lg border border-border bg-background overflow-hidden">
                      <div className="px-3 py-2 border-b border-border">
                        <span className="text-xs text-muted-foreground font-mono">mermaid</span>
                      </div>
                      <div className="p-8 flex items-center justify-center min-h-[120px]">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <span className="text-xs text-muted-foreground">Loading diagram...</span>
                        </div>
                      </div>
                    </div>
                  }
                >
                  <LazyMermaidRenderer chart={rawText} />
                </Suspense>
              );
            }

            if (isBlock) {
              // For future context inference, we could pass preceding text here
              // Currently using empty string as default
              return (
                <CodeBlockWithPreview className={className} language={language} context="">
                  {children}
                </CodeBlockWithPreview>
              );
            }

            return (
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...restProps}>
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
});

MarkdownRenderer.displayName = 'MarkdownRenderer';
