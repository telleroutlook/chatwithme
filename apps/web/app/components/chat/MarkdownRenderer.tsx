import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Copy, Check, Download, Eye, Code, Sun, Moon } from 'lucide-react';
import { useState, useMemo, memo, useEffect, useRef } from 'react';
import { cn } from '~/lib/utils';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const extractText = (node: React.ReactNode): string => {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const nodeWithProps = node as { props?: { children?: React.ReactNode } };
    return extractText(nodeWithProps.props?.children ?? '');
  }
  return '';
};

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const hasBalancedHtmlTags = (code: string): boolean => {
  const stack: string[] = [];
  const tagRegex = /<\/?([a-zA-Z][\w:-]*)(\s[^<>]*?)?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(code)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith('</');
    const isSelfClosing = fullTag.endsWith('/>');

    if (isClosing) {
      const top = stack[stack.length - 1];
      if (top !== tagName) {
        return false;
      }
      stack.pop();
      continue;
    }

    if (!isSelfClosing && !VOID_TAGS.has(tagName)) {
      stack.push(tagName);
    }
  }

  return stack.length === 0;
};

const isPreviewCodeComplete = (rawCode: string, isSvg: boolean): boolean => {
  const trimmedCode = rawCode.trim();
  if (!trimmedCode) return false;
  if (!/<[a-z!/]/i.test(trimmedCode)) return false;
  if (/<[^>]*$/.test(trimmedCode)) return false;

  if (isSvg) {
    if (!/<svg[\s>]/i.test(trimmedCode)) return false;
    if (!/<\/svg>/i.test(trimmedCode)) return false;
  }

  return hasBalancedHtmlTags(trimmedCode);
};

// ============================================================================
// KATEX RENDERER (Client-side only)
// ============================================================================

interface KatexRendererProps {
  math: string;
  inline?: boolean;
}

const KatexRenderer = memo<KatexRendererProps>(({ math, inline = false }) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!containerRef.current || rendered) return;

    // Dynamic import of katex
    import('katex').then((katex) => {
      if (containerRef.current) {
        try {
          katex.render(math, containerRef.current, {
            throwOnError: false,
            displayMode: !inline,
          });
          setRendered(true);
        } catch (e) {
          console.error('KaTeX render error:', e);
          if (containerRef.current) {
            containerRef.current.textContent = math;
          }
        }
      }
    }).catch((e) => {
      console.error('Failed to load KaTeX:', e);
      if (containerRef.current) {
        containerRef.current.textContent = math;
      }
    });
  }, [math, inline, rendered]);

  return (
    <span
      ref={containerRef}
      className={cn(inline ? 'inline' : 'block my-2')}
    />
  );
});
KatexRenderer.displayName = 'KatexRenderer';

// ============================================================================
// MARKDOWN RENDERER COMPONENT
// ============================================================================

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('prose prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const rawText = extractText(children).replace(/\n$/, '');
            const isBlock = match || rawText.includes('\n');

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
                {...props}
              >
                {children}
              </code>
            );
          },
          // Handle math nodes from remark-math
          span: ({ className, children, ...props }) => {
            if (className === 'math math-inline') {
              return <KatexRenderer math={extractText(children)} inline />;
            }
            return <span className={className} {...props}>{children}</span>;
          },
          div: ({ className, children, ...props }) => {
            if (className === 'math math-display') {
              return <KatexRenderer math={extractText(children)} />;
            }
            return <div className={className} {...props}>{children}</div>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ============================================================================
// CODE BLOCK COMPONENTS
// ============================================================================

interface CopyButtonProps {
  text: string;
}

const CopyButton = memo<CopyButtonProps>(({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-md transition-all"
      title="Copy code"
      aria-label={copied ? 'Copied' : 'Copy code'}
    >
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </button>
  );
});
CopyButton.displayName = 'CopyButton';

interface DownloadButtonProps {
  text: string;
  language: string;
}

const DownloadButton = memo<DownloadButtonProps>(({ text, language }) => {
  const handleDownload = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const extensions: { [key: string]: string } = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      html: 'html',
      css: 'css',
      json: 'json',
      markdown: 'md',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      go: 'go',
      rust: 'rs',
      php: 'php',
      ruby: 'rb',
      swift: 'swift',
      kotlin: 'kt',
      sql: 'sql',
      shell: 'sh',
      bash: 'sh',
      xml: 'xml',
      yaml: 'yaml',
      svg: 'svg',
    };

    const ext = extensions[language.toLowerCase()] || 'txt';
    a.download = `code_snippet.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleDownload}
      className="p-1.5 text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-md transition-all"
      title="Download file"
      aria-label="Download code"
    >
      <Download className="h-4 w-4" />
    </button>
  );
});
DownloadButton.displayName = 'DownloadButton';

interface CodeBlockWithPreviewProps {
  children: React.ReactNode;
  className?: string;
  language: string;
}

const CodeBlockWithPreview = memo<CodeBlockWithPreviewProps>(
  ({ children, className, language }) => {
    const rawCode = extractText(children).replace(/\n$/, '');

    // Enhanced detection for previewable content
    const isSvg = language === 'svg' || (language === 'xml' && rawCode.trim().startsWith('<svg'));
    const canPreview = language === 'html' || isSvg;
    const isPreviewReady = useMemo(
      () => (canPreview ? isPreviewCodeComplete(rawCode, isSvg) : false),
      [canPreview, rawCode, isSvg]
    );

    const [activeTab, setActiveTab] = useState<'code' | 'preview'>(() =>
      isPreviewReady ? 'preview' : 'code'
    );
    const [previewBg, setPreviewBg] = useState<'light' | 'dark'>('light');

    useEffect(() => {
      setActiveTab((prev) => {
        if (isPreviewReady && prev === 'code') return 'preview';
        if (!isPreviewReady && prev === 'preview') return 'code';
        return prev;
      });
    }, [isPreviewReady]);

    const iframeSrc = useMemo(() => {
      const bg = previewBg === 'light' ? '#ffffff' : '#0f172a';
      const fg = previewBg === 'light' ? '#1e293b' : '#f8fafc';
      return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 24px;
              font-family: 'Inter', system-ui, -apple-system, sans-serif;
              color: ${fg};
              background-color: ${bg};
              display: flex;
              justify-content: center;
              min-height: 100vh;
              box-sizing: border-box;
            }
            .content-wrapper {
               width: 100%;
               max-width: 100%;
               ${isSvg ? 'display: flex; justify-content: center; align-items: center;' : ''}
            }
            svg { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          <div class="content-wrapper">
             ${rawCode}
          </div>
        </body>
      </html>
    `;
    }, [rawCode, previewBg, isSvg]);

    return (
      <div className="relative group my-4 rounded-lg overflow-hidden border border-border bg-muted/30">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground lowercase font-mono">
              {language || 'code'}
            </span>
            {canPreview && (
              <div className="flex bg-background rounded-md p-0.5 border border-border">
                <button
                  onClick={() => setActiveTab('code')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                    activeTab === 'code'
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label="View Code"
                >
                  <Code className="h-3 w-3" /> Code
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  disabled={!isPreviewReady}
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                    activeTab === 'preview'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                    !isPreviewReady && 'opacity-50 cursor-not-allowed'
                  )}
                  aria-label="View Preview"
                >
                  <Eye className="h-3 w-3" /> Preview
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {activeTab === 'preview' && isPreviewReady && (
              <button
                onClick={() => setPreviewBg((prev) => (prev === 'light' ? 'dark' : 'light'))}
                className="p-1.5 text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-md transition-all mr-1"
                title={`Switch to ${previewBg === 'light' ? 'dark' : 'light'} background`}
              >
                {previewBg === 'light' ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Sun className="h-4 w-4" />
                )}
              </button>
            )}
            <DownloadButton text={rawCode} language={language} />
            <CopyButton text={rawCode} />
          </div>
        </div>

        {/* Content */}
        {activeTab === 'preview' && isPreviewReady ? (
          <div className="bg-background overflow-hidden h-[400px] resize-y relative rounded-b-lg border-t border-border">
            <iframe
              srcDoc={iframeSrc}
              className="w-full h-full border-0 bg-transparent"
              sandbox="allow-scripts"
              title="Code Preview"
            />
          </div>
        ) : (
          <pre className="!bg-background !p-4 overflow-x-auto rounded-b-lg">
            <code className={className}>{children}</code>
          </pre>
        )}
      </div>
    );
  }
);
CodeBlockWithPreview.displayName = 'CodeBlockWithPreview';
