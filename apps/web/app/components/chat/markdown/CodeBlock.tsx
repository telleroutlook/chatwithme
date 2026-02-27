import { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Copy, Check, Eye, Code, FileText, Image as ImageIcon, FileDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import { cn } from '~/lib/utils';
import { sanitizeFileName } from '~/lib/utils';
import {
  downloadSvgElementAsPng,
  extractText,
  isPreviewCodeComplete,
  FULL_HTML_DOC_PATTERN,
  normalizeMarkdownContent,
} from './utils';
import { parseCodeBlockTitle, countLines } from './titleParser';
import {
  getLanguageConfig,
  isPreviewableLanguage,
  isVegaLiteLanguage,
  isMermaidLanguage,
  isMarkdownLanguage,
} from './languageConfig';
import { getDefaultTab } from './tabSelector';
import { isVegaLiteSpec } from './vegaLiteUtils';
import { TitleView } from './TitleView';
import { DropdownMenu } from './DropdownMenu';
import { KatexRenderer } from './KatexBlock';
import type {
  CopyButtonProps,
  DownloadButtonProps,
  CodeBlockWithPreviewProps,
  CodeBlockTab,
  DownloadOption,
} from './types';
import { useThemeStore } from '~/stores/theme';

export const CopyButton = memo<CopyButtonProps>(({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
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

export const DownloadButton = memo<DownloadButtonProps>(
  ({
    text,
    language,
    filename = 'code',
    onDownloadAsPng,
    isVegaLite,
    isMermaid,
    isMarkdown,
    markdownContainerRef,
  }) => {
    const handleDownloadSource = useCallback(() => {
      const sanitizedFilename = sanitizeFileName(filename);
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sanitizedFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, [text, filename]);

    const handleDownloadAsPng = useCallback(async () => {
      if (onDownloadAsPng) {
        await onDownloadAsPng();
      }
    }, [onDownloadAsPng]);

    // Download as Markdown (.md)
    const handleDownloadAsMd = useCallback(() => {
      const sanitizedFilename = sanitizeFileName(filename.replace(/\.\w+$/, '.md'));
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sanitizedFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, [text, filename]);

    // Download as PDF (rendered output)
    const handleDownloadAsPdf = useCallback(
      async (containerRef?: React.RefObject<HTMLDivElement | null>) => {
        try {
          // Dynamic imports for code splitting
          const html2canvas = (await import('html2canvas')).default;
          const { jsPDF } = await import('jspdf');

          // Get the rendered content
          const element = containerRef?.current;
          if (!element) {
            // Fallback to markdown source if no container ref
            handleDownloadAsMd();
            return;
          }

          // Capture the rendered content
          const canvas = await html2canvas(element, {
            scale: 2, // Higher quality
            useCORS: true,
            logging: false,
            backgroundColor: null, // Transparent background
          });

          const imgData = canvas.toDataURL('image/png');
          const imgWidth = canvas.width;
          const imgHeight = canvas.height;

          // Calculate PDF dimensions (A4)
          const pdfWidth = 210; // A4 width in mm
          const pdfHeight = 297; // A4 height in mm
          const margin = 10; // 10mm margin
          const contentWidth = pdfWidth - 2 * margin;

          // Calculate scaled dimensions
          const scale = contentWidth / (imgWidth / 2); // /2 because scale: 2
          const scaledHeight = (imgHeight / 2) * scale;

          // Create PDF
          const pdf = new jsPDF({
            orientation: scaledHeight > pdfHeight - 2 * margin ? 'portrait' : 'landscape',
            unit: 'mm',
            format: 'a4',
          });

          // If content is taller than one page, split across pages
          if (scaledHeight > pdfHeight - 2 * margin) {
            const pageHeight = pdfHeight - 2 * margin;
            let yPosition = margin;
            let remainingHeight = scaledHeight;
            let sourceY = 0;

            while (remainingHeight > 0) {
              if (yPosition > margin) {
                pdf.addPage();
              }

              const chunkHeight = Math.min(remainingHeight, pageHeight);
              const sourceHeight = (chunkHeight / scale) * 2; // *2 because scale: 2

              // Add image chunk
              pdf.addImage(
                imgData,
                'PNG',
                margin,
                yPosition,
                contentWidth,
                chunkHeight,
                undefined,
                'FAST',
                0
              );

              remainingHeight -= chunkHeight;
              sourceY += sourceHeight;
              yPosition = margin;
            }
          } else {
            // Single page
            pdf.addImage(imgData, 'PNG', margin, margin, contentWidth, scaledHeight);
          }

          // Download
          const sanitizedFilename = sanitizeFileName(filename.replace(/\.\w+$/, '.pdf'));
          pdf.save(sanitizedFilename);
        } catch (error) {
          console.error('[DownloadButton] PDF export error:', error);
          // Fallback: download as .md
          handleDownloadAsMd();
        }
      },
      [filename, handleDownloadAsMd]
    );

    // Build download options
    const options: DownloadOption[] = useMemo(() => {
      // Markdown-specific download options
      if (isMarkdown) {
        return [
          {
            id: 'md',
            label: filename.replace(/\.\w+$/, '.md'),
            icon: <FileText className="h-4 w-4" />,
            action: handleDownloadAsMd,
          },
          {
            id: 'pdf',
            label: filename.replace(/\.\w+$/, '.pdf'),
            icon: <FileDown className="h-4 w-4" />,
            action: () => handleDownloadAsPdf(markdownContainerRef),
          },
        ];
      }

      const opts: DownloadOption[] = [
        {
          id: 'source',
          label: filename,
          icon: <FileText className="h-4 w-4" />,
          action: handleDownloadSource,
        },
      ];

      // Add PNG option for SVG/HTML/Vega-Lite/Mermaid
      const lowerLanguage = language.toLowerCase();
      const trimmedText = text.trim();
      const isSvgCode =
        lowerLanguage === 'svg' || (lowerLanguage === 'xml' && trimmedText.startsWith('<svg'));
      const isHtmlCode = lowerLanguage === 'html';

      if ((isSvgCode || isHtmlCode || isVegaLite || isMermaid) && onDownloadAsPng) {
        opts.push({
          id: 'png',
          label: `Export as PNG`,
          icon: <ImageIcon className="h-4 w-4" />,
          action: handleDownloadAsPng,
        });
      }

      return opts;
    }, [
      isMarkdown,
      filename,
      handleDownloadAsMd,
      handleDownloadAsPdf,
      markdownContainerRef,
      language,
      text,
      handleDownloadSource,
      handleDownloadAsPng,
      onDownloadAsPng,
      isVegaLite,
      isMermaid,
    ]);

    return <DropdownMenu options={options} />;
  }
);
DownloadButton.displayName = 'DownloadButton';

/**
 * Vega-Lite preview component using vega-embed
 */
interface VegaLitePreviewProps {
  spec: string;
  onViewReady?: (view: unknown) => void;
  onHeightChange?: (height: number) => void;
}

const VegaLitePreview = memo<VegaLitePreviewProps>(({ spec, onViewReady, onHeightChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<unknown>(null);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const renderChart = async () => {
      if (!containerRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        // Dynamic import for code splitting
        const embed = (await import('vega-embed')).default;

        const parsedSpec = JSON.parse(spec);
        const result = await embed(containerRef.current, parsedSpec, {
          actions: false,
          renderer: 'svg',
          theme: resolvedTheme === 'dark' ? 'dark' : undefined,
        });

        if (!mounted) return;

        viewRef.current = result.view;
        onViewReady?.(result.view);

        // Get actual rendered height and notify parent
        const view = result.view as { height?: () => number; _height?: number };
        const renderedHeight =
          typeof view.height === 'function' ? view.height() : view._height || 300;
        onHeightChange?.(renderedHeight + 32); // Add padding

        setIsLoading(false);
      } catch (err) {
        if (!mounted) return;
        console.error('[VegaLitePreview] Render error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render chart');
        setIsLoading(false);
      }
    };

    renderChart();

    return () => {
      mounted = false;
      // Cleanup view on unmount
      if (
        viewRef.current &&
        typeof (viewRef.current as { finalize?: () => void }).finalize === 'function'
      ) {
        (viewRef.current as { finalize: () => void }).finalize();
      }
    };
  }, [spec, resolvedTheme, onViewReady, onHeightChange]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive p-4">
        <p className="text-sm">Failed to render chart: {error}</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "relative w-full h-full overflow-auto",
      resolvedTheme === 'dark' ? 'bg-[#1a1a1a]' : 'bg-white'
    )}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}
      <div
        ref={containerRef}
        className="vega-lite-container flex items-center justify-center p-4"
      />
    </div>
  );
});
VegaLitePreview.displayName = 'VegaLitePreview';

/**
 * Mermaid preview component for diagram rendering
 */
interface MermaidPreviewProps {
  chart: string;
  onViewReady?: (svgElement: SVGSVGElement | null) => void;
  onHeightChange?: (height: number) => void;
}

const MermaidPreview = memo<MermaidPreviewProps>(({ chart, onViewReady, onHeightChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useThemeStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const renderChart = async () => {
      if (!containerRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: resolvedTheme === 'dark' ? 'dark' : 'default',
        });

        const renderId = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg } = await mermaid.render(renderId, chart);

        if (!mounted) return;

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          const svgElement = containerRef.current.querySelector('svg');
          onViewReady?.(svgElement);
          if (svgElement) {
            const height = svgElement.getBoundingClientRect().height;
            onHeightChange?.(height + 32); // Add padding
          }
        }
      } catch (err) {
        if (!mounted) return;
        console.error('[MermaidPreview] Render error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    renderChart();

    return () => {
      mounted = false;
    };
  }, [chart, resolvedTheme, onViewReady, onHeightChange]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive p-4">
        <p className="text-sm">Failed to render diagram: {error}</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "relative w-full h-full overflow-auto",
      resolvedTheme === 'dark' ? 'bg-[#1a1a1a]' : 'bg-white'
    )}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}
      <div ref={containerRef} className="mermaid-container flex items-center justify-center p-4" />
    </div>
  );
});
MermaidPreview.displayName = 'MermaidPreview';

/**
 * Markdown preview component using ReactMarkdown directly
 * Supports theme-aware background and PDF export via forwarded ref
 */
interface MarkdownPreviewProps {
  content: string;
  onHeightChange?: (height: number) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

const MarkdownPreview = memo<MarkdownPreviewProps>(({ content, onHeightChange, containerRef: externalRef }) => {
  const internalRef = useRef<HTMLDivElement>(null);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  // Normalize content
  const normalizedContent = useMemo(() => normalizeMarkdownContent(content), [content]);

  // Callback ref to properly sync both refs
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Update internal ref
      (internalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      // Update external ref if provided
      if (externalRef) {
        (externalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [externalRef]
  );

  // Report height when content changes
  useEffect(() => {
    if (internalRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        const height = entries[0]?.contentRect.height;
        if (height) {
          onHeightChange?.(height + 32); // Add padding
        }
      });
      resizeObserver.observe(internalRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [onHeightChange]);

  return (
    <div
      ref={setRef}
      className={cn(
        'markdown-preview-container p-6 prose prose-sm max-w-none',
        resolvedTheme === 'dark' ? 'prose-invert bg-[#1a1a1a]' : 'bg-white'
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: (props) => {
            const { className, children, ...restProps } = props;
            const inline = 'inline' in props && Boolean((props as { inline?: boolean }).inline);
            const rawText = extractText(children).replace(/\n$/, '');
            const isMathInline = (className || '').includes('math-inline');
            const isMathDisplay = (className || '').includes('math-display');
            const isMath = isMathInline || isMathDisplay;

            if (isMath) {
              return <KatexRenderer math={rawText} inline={inline || isMathInline} />;
            }

            if (inline) {
              return (
                <code
                  className={cn(
                    'px-1.5 py-0.5 rounded text-sm font-mono',
                    resolvedTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                  )}
                  {...restProps}
                >
                  {children}
                </code>
              );
            }

            // Block code - render as pre with theme-aware background
            return (
              <pre
                className={cn(
                  'rounded-lg p-4 overflow-x-auto',
                  resolvedTheme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
                )}
              >
                <code className={className}>{children}</code>
              </pre>
            );
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
});
MarkdownPreview.displayName = 'MarkdownPreview';

export const CodeBlockWithPreview = memo<CodeBlockWithPreviewProps>(
  ({ children, className, language }) => {
    const rawCode = useMemo(() => extractText(children).replace(/\n$/, ''), [children]);
    const vegaLiteViewRef = useRef<unknown>(null);
    const mermaidSvgRef = useRef<SVGSVGElement | null>(null);
    const markdownContainerRef = useRef<HTMLDivElement | null>(null);
    const [vegaLiteHeight, setVegaLiteHeight] = useState<number | null>(null);
    const [mermaidHeight, setMermaidHeight] = useState<number | null>(null);
    const [iframeHeight, setIframeHeight] = useState<number | null>(null);
    const [markdownHeight, setMarkdownHeight] = useState<number | null>(null);
    const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

    // Parse title and metadata
    const { filename, displayName } = useMemo(
      () => parseCodeBlockTitle(language, rawCode),
      [language, rawCode]
    );

    const lineCount = useMemo(() => countLines(rawCode), [rawCode]);
    const langConfig = useMemo(() => getLanguageConfig(language), [language]);

    // Vega-Lite detection
    const isVegaLite = useMemo(() => {
      // Check language identifier first
      if (isVegaLiteLanguage(language)) return true;
      // Fallback: detect JSON structure
      if (language === 'json' && isVegaLiteSpec(rawCode)) return true;
      return false;
    }, [language, rawCode]);

    // Mermaid detection
    const isMermaid = useMemo(() => isMermaidLanguage(language), [language]);

    // Markdown detection
    const isMarkdown = useMemo(() => isMarkdownLanguage(language), [language]);

    // Preview detection
    const isSvg = useMemo(
      () => language === 'svg' || (language === 'xml' && rawCode.trim().startsWith('<svg')),
      [language, rawCode]
    );
    const canPreview = useMemo(() => {
      // Mermaid can always preview
      if (isMermaid) return true;
      // Vega-Lite can always preview
      if (isVegaLite) return true;
      // Markdown can always preview
      if (isMarkdown) return true;
      // HTML/SVG previewable languages
      return isPreviewableLanguage(language);
    }, [isMermaid, isVegaLite, isMarkdown, language]);

    const isPreviewReady = useMemo(() => {
      // Mermaid is always ready
      if (isMermaid) return true;
      // Vega-Lite is always ready
      if (isVegaLite) return true;
      // Markdown is always ready
      if (isMarkdown) return true;
      // HTML/SVG needs validation
      return canPreview ? isPreviewCodeComplete(rawCode, isSvg) : false;
    }, [isMermaid, isVegaLite, isMarkdown, canPreview, rawCode, isSvg]);

    // Get viewport width
    const [viewportWidth, setViewportWidth] = useState(1200);
    useEffect(() => {
      const handleResize = () => setViewportWidth(window.innerWidth);
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Listen for iframe height messages
    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'preview-height' && typeof event.data.height === 'number') {
          setIframeHeight(event.data.height);
        }
      };
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Determine default tab
    // Override category based on content type
    const effectiveCategory = useMemo(() => {
      if (isMermaid) return 'mermaid';
      if (isVegaLite) return 'vegalite';
      if (isMarkdown) return 'markdown';
      return langConfig.category;
    }, [isMermaid, isVegaLite, isMarkdown, langConfig.category]);

    const initialTab = useMemo(() => {
      return getDefaultTab({
        category: effectiveCategory,
        lineCount,
        isPreviewReady,
        viewportWidth,
      });
    }, [effectiveCategory, lineCount, isPreviewReady, viewportWidth]);

    const [activeTab, setActiveTab] = useState<CodeBlockTab>(initialTab);

    // Update tab when preview becomes ready
    useEffect(() => {
      setActiveTab((prev) => {
        // If we're in title view and preview becomes ready, stay in title
        if (prev === 'title' && isPreviewReady) {
          return 'title';
        }
        // If preview becomes ready and we're in code, switch to preview
        if (isPreviewReady && prev === 'code') {
          return 'preview';
        }
        // If preview is no longer ready and we're in preview, switch to code
        if (!isPreviewReady && prev === 'preview') {
          return 'code';
        }
        return prev;
      });
    }, [isPreviewReady]);

    // Generate iframe source for preview
    const iframeSrc = useMemo(() => {
      // Check if this is a full HTML document
      const isFullHtmlDoc = FULL_HTML_DOC_PATTERN.test(rawCode.trim());

      // Script to report content height to parent
      const heightReporter = `
        <script>
          (function() {
            function sendHeight() {
              var height = Math.max(
                document.body.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight
              );
              window.parent.postMessage({ type: 'preview-height', height: height }, '*');
            }
            window.addEventListener('load', sendHeight);
            if (typeof ResizeObserver !== 'undefined') {
              new ResizeObserver(sendHeight).observe(document.body);
            }
          })();
        </script>
      `;

      // For full HTML documents, inject height reporter before closing body tag
      if (isFullHtmlDoc) {
        return rawCode.replace('</body>', heightReporter + '</body>');
      }

      // Theme-aware colors
      const bg = resolvedTheme === 'dark' ? '#1a1a1a' : '#ffffff';
      const fg = resolvedTheme === 'dark' ? '#e5e5e5' : '#1e293b';
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
          ${heightReporter}
        </body>
      </html>
    `;
    }, [rawCode, isSvg, resolvedTheme]);

    // Handle PNG download
    const handleDownloadAsPng = useCallback(async () => {
      const trimmedText = rawCode.trim();
      const isSvgCode =
        language.toLowerCase() === 'svg' ||
        (language.toLowerCase() === 'xml' && trimmedText.startsWith('<svg'));

      // Mermaid PNG export
      if (isMermaid && mermaidSvgRef.current) {
        try {
          const pngFilename = sanitizeFileName(filename.replace(/\.\w+$/, '.png'));
          await downloadSvgElementAsPng(mermaidSvgRef.current, pngFilename);
        } catch (error) {
          console.error('[CodeBlock] Mermaid PNG export error:', error);
        }
        return;
      }

      // Vega-Lite PNG export
      if (isVegaLite && vegaLiteViewRef.current) {
        try {
          const view = vegaLiteViewRef.current as { toImageURL: (type: string) => Promise<string> };
          const pngUrl = await view.toImageURL('png');
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = sanitizeFileName(filename.replace(/\.\w+$/, '.png'));
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (error) {
          console.error('[CodeBlock] Vega-Lite PNG export error:', error);
        }
        return;
      }

      // SVG/HTML PNG export
      if (isSvgCode) {
        try {
          const parsed = new DOMParser().parseFromString(trimmedText, 'image/svg+xml');
          const svgElement = parsed.querySelector('svg');
          const parseError = parsed.querySelector('parsererror');

          if (!svgElement || parseError) {
            throw new Error('Invalid SVG markup');
          }

          const pngFilename = sanitizeFileName(filename.replace(/\.\w+$/, '.png'));
          await downloadSvgElementAsPng(svgElement as unknown as SVGSVGElement, pngFilename);
        } catch (error) {
          console.error('[CodeBlock] PNG download error:', error);
        }
      }
    }, [rawCode, language, filename, isMermaid, isVegaLite]);

    // Tab button handler
    const handleTabChange = useCallback((tab: CodeBlockTab) => {
      setActiveTab(tab);
    }, []);

    // Switch to code from title view
    const handleSwitchToCode = useCallback(() => {
      setActiveTab('code');
    }, []);

    // Handle Vega-Lite view ready (for export)
    const handleVegaLiteViewReady = useCallback((view: unknown) => {
      vegaLiteViewRef.current = view;
    }, []);

    // Handle Vega-Lite height change
    const handleVegaLiteHeightChange = useCallback((height: number) => {
      setVegaLiteHeight(height);
    }, []);

    // Handle Mermaid SVG ready (for export)
    const handleMermaidViewReady = useCallback((svgElement: SVGSVGElement | null) => {
      mermaidSvgRef.current = svgElement;
    }, []);

    // Handle Mermaid height change
    const handleMermaidHeightChange = useCallback((height: number) => {
      setMermaidHeight(height);
    }, []);

    // Handle Markdown height change
    const handleMarkdownHeightChange = useCallback((height: number) => {
      setMarkdownHeight(height);
    }, []);

    // Calculate preview container style based on content type
    const previewContainerStyle = useMemo(() => {
      // Vega-Lite height (with constraints)
      if (isVegaLite && vegaLiteHeight !== null) {
        const clampedHeight = Math.min(Math.max(vegaLiteHeight, 200), 600);
        return { height: `${clampedHeight}px` };
      }
      // Mermaid height (with constraints)
      if (isMermaid && mermaidHeight !== null) {
        const clampedHeight = Math.min(Math.max(mermaidHeight, 200), 800);
        return { height: `${clampedHeight}px` };
      }
      // Markdown height (with constraints)
      if (isMarkdown && markdownHeight !== null) {
        const clampedHeight = Math.min(Math.max(markdownHeight, 200), 1000);
        return { height: `${clampedHeight}px` };
      }
      // Iframe height for HTML/SVG (with constraints)
      if (iframeHeight !== null) {
        const clampedHeight = Math.min(Math.max(iframeHeight, 200), 800);
        return { height: `${clampedHeight}px` };
      }
      return undefined;
    }, [isVegaLite, vegaLiteHeight, isMermaid, mermaidHeight, isMarkdown, markdownHeight, iframeHeight]);

    return (
      <div className="relative group my-4 rounded-lg overflow-hidden border border-border bg-muted/30">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-muted/50 border-b border-border">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground lowercase font-mono">
              {language || 'code'}
            </span>

            {/* Tab buttons */}
            <div className="flex max-w-full overflow-x-auto bg-background rounded-md p-0.5 border border-border">
              <button
                onClick={() => handleTabChange('title')}
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                  activeTab === 'title'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-label="View Title"
              >
                <FileText className="h-3 w-3" /> Title
              </button>
              <button
                onClick={() => handleTabChange('code')}
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
              {canPreview && (
                <button
                  onClick={() => handleTabChange('preview')}
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
              )}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <DownloadButton
              text={rawCode}
              language={language}
              filename={filename}
              onDownloadAsPng={handleDownloadAsPng}
              isVegaLite={isVegaLite}
              isMermaid={isMermaid}
              isMarkdown={isMarkdown}
              markdownContainerRef={markdownContainerRef}
            />
            <CopyButton text={rawCode} />
          </div>
        </div>

        {/* Content */}
        {activeTab === 'title' ? (
          <div className="p-2 bg-background">
            <TitleView
              meta={{
                language,
                filename,
                displayName,
                lineCount,
                category: langConfig.category,
              }}
              onSwitchToCode={handleSwitchToCode}
            />
          </div>
        ) : activeTab === 'preview' && isPreviewReady ? (
          <div
            className={cn(
              "bg-background overflow-hidden min-h-[200px] resize-y relative rounded-b-lg border-t border-border",
              isMarkdown ? "max-h-[1000px]" : "max-h-[800px]"
            )}
            style={previewContainerStyle ?? { height: '50vh' }}
          >
            {isMarkdown ? (
              <MarkdownPreview
                content={rawCode}
                onHeightChange={setMarkdownHeight}
                containerRef={markdownContainerRef}
              />
            ) : isVegaLite ? (
              <VegaLitePreview
                spec={rawCode}
                onViewReady={handleVegaLiteViewReady}
                onHeightChange={handleVegaLiteHeightChange}
              />
            ) : isMermaid ? (
              <MermaidPreview
                chart={rawCode}
                onViewReady={handleMermaidViewReady}
                onHeightChange={handleMermaidHeightChange}
              />
            ) : (
              <iframe
                srcDoc={iframeSrc}
                className="w-full h-full border-0 bg-transparent"
                sandbox="allow-scripts allow-forms allow-popups allow-modals"
                title="Code Preview"
              />
            )}
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
