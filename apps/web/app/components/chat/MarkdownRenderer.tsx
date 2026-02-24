import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
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

const parseSvgNumber = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getSvgSize = (svgElement: SVGSVGElement): { width: number; height: number } => {
  const widthAttr = parseSvgNumber(svgElement.getAttribute('width'));
  const heightAttr = parseSvgNumber(svgElement.getAttribute('height'));

  if (widthAttr && heightAttr) {
    return { width: widthAttr, height: heightAttr };
  }

  const viewBox = svgElement.viewBox.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const rect = svgElement.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }

  return { width: 1200, height: 800 };
};

const downloadSvgElementAsPng = async (
  svgElement: SVGSVGElement,
  filename: string
): Promise<void> => {
  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const { width, height } = getSvgSize(svgClone);
  const serializedSvg = new XMLSerializer().serializeToString(svgClone);
  const svgBlob = new Blob([serializedSvg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load SVG for PNG export'));
      image.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context is not available');
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to convert canvas to PNG'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    });

    const isMobileWebKit =
      /AppleWebKit/i.test(navigator.userAgent) &&
      /Mobile|iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobileWebKit) {
      const file = new File([pngBlob], filename, { type: 'image/png' });
      const shareData = { files: [file], title: filename };

      if (
        typeof navigator.canShare === 'function' &&
        navigator.canShare(shareData) &&
        typeof navigator.share === 'function'
      ) {
        await navigator.share(shareData);
        return;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to open PNG data URL'));
        reader.readAsDataURL(pngBlob);
      });

      const popup = window.open(dataUrl, '_blank');
      if (!popup) {
        window.location.href = dataUrl;
      }
      return;
    }

    const pngUrl = URL.createObjectURL(pngBlob);
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 30_000);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
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

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamic import of katex
    import('katex').then((katex) => {
      if (containerRef.current) {
        try {
          containerRef.current.textContent = '';
          katex.render(math, containerRef.current, {
            throwOnError: false,
            displayMode: !inline,
          });
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
  }, [math, inline]);

  return (
    <span
      ref={containerRef}
      className={cn(inline ? 'inline' : 'block my-2')}
    />
  );
});
KatexRenderer.displayName = 'KatexRenderer';

// ============================================================================
// MERMAID RENDERER (Client-side only)
// ============================================================================

interface MermaidRendererProps {
  chart: string;
}

const MermaidRenderer = memo<MermaidRendererProps>(({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPng = async () => {
    if (!containerRef.current || isLoading || isDownloading) return;

    const svgElement = containerRef.current.querySelector('svg');
    if (!svgElement) return;

    setIsDownloading(true);
    try {
      await downloadSvgElementAsPng(svgElement, 'mermaid-diagram.png');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to export Mermaid PNG';
      setError(message);
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const renderChart = async () => {
      if (!containerRef.current) return;

      setIsLoading(true);
      setError(null);

      try {
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'dark',
        });

        const renderId = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg } = await mermaid.render(renderId, chart);

        if (mounted && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (e) {
        if (mounted) {
          const message = e instanceof Error ? e.message : 'Failed to render Mermaid diagram';
          setError(message);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void renderChart();

    return () => {
      mounted = false;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="my-4 rounded-lg border border-border bg-background">
        <div className="px-3 py-2 border-b border-border text-xs text-destructive">
          Mermaid render failed: {error}
        </div>
        <pre className="!bg-background !p-4 overflow-x-auto rounded-b-lg">
          <code className="language-mermaid">{chart}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-lg border border-border bg-background overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono">mermaid</span>
        <button
          onClick={() => void handleDownloadPng()}
          disabled={isLoading || isDownloading}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="Download PNG"
          aria-label="Download Mermaid PNG"
        >
          <Download className="h-3.5 w-3.5" />
          {isDownloading ? 'Exporting...' : 'PNG'}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <div ref={containerRef} className="mermaid-diagram min-h-[120px]" />
        {isLoading && (
          <div className="text-sm text-muted-foreground">Rendering diagram...</div>
        )}
      </div>
    </div>
  );
});
MermaidRenderer.displayName = 'MermaidRenderer';

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
