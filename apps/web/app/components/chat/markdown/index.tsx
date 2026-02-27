import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { memo } from 'react';
import 'katex/dist/katex.min.css';
import { cn } from '~/lib/utils';
import { extractText, normalizeMarkdownContent } from './utils';
import { KatexRenderer } from './KatexBlock';
import { CodeBlockWithPreview } from './CodeBlock';
import { CodeHighlightTheme } from './CodeHighlightTheme';
import { useThemeStore } from '~/stores/theme';
import type { MarkdownRendererProps } from './types';

export const MarkdownRenderer = memo<MarkdownRendererProps>(({ content, className }) => {
  const normalizedContent = normalizeMarkdownContent(content);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  return (
    <div
      className={cn(
        'prose max-w-none break-words',
        resolvedTheme === 'dark' ? 'prose-invert' : '',
        '[&_pre]:max-w-full [&_pre]:overflow-x-auto',
        '[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto',
        '[&_img]:max-w-full',
        className
      )}
    >
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

            if (isBlock) {
              // All code blocks including mermaid now go through CodeBlockWithPreview
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
