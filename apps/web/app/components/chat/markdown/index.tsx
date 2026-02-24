import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import { cn } from '~/lib/utils';
import { extractText } from './utils';
import { KatexRenderer } from './KatexBlock';
import { MermaidRenderer } from './MermaidBlock';
import { CodeBlockWithPreview } from './CodeBlock';
import type { MarkdownRendererProps } from './types';

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
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
              return <MermaidRenderer chart={rawText} />;
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
        {content}
      </ReactMarkdown>
    </div>
  );
}
