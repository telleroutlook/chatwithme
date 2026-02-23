import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import DOMPurify from 'isomorphic-dompurify';
import { Copy, Check, Download, Eye, Code, Sun, Moon } from 'lucide-react';
import { useState, useMemo, memo } from 'react';
import { cn } from '~/lib/utils';

// Import KaTeX CSS
import 'katex/dist/katex.min.css';

// ============================================================================
// XSS PROTECTION CONFIGURATION
// ============================================================================

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote',
    'a', 'img',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'div', 'span',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'target', 'rel',
    'colspan', 'rowspan',
  ],
  ALLOW_DATA_ATTR: true,
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

const sanitizeContent = (content: string): string => {
  return DOMPurify.sanitize(content, PURIFY_CONFIG);
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const extractText = (node: React.ReactNode): string => {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return extractText(node.props.children);
  }
  return '';
};

// ============================================================================
// MARKDOWN RENDERER COMPONENT
// ============================================================================

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const sanitizedContent = useMemo(() => sanitizeContent(content), [content]);

  return (
    <div className={cn('prose prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
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
        }}
      >
        {sanitizedContent}
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

    const [activeTab, setActiveTab] = useState<'code' | 'preview'>(canPreview ? 'preview' : 'code');
    const [previewBg, setPreviewBg] = useState<'light' | 'dark'>('light');

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
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                    activeTab === 'preview'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label="View Preview"
                >
                  <Eye className="h-3 w-3" /> Preview
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {activeTab === 'preview' && canPreview && (
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
        {activeTab === 'preview' && canPreview ? (
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
