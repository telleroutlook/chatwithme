import { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Copy, Check, Eye, Code, FileText, Image as ImageIcon } from 'lucide-react';
import { cn } from '~/lib/utils';
import { sanitizeFileName } from '~/lib/utils';
import {
  downloadSvgElementAsPng,
  extractText,
  isPreviewCodeComplete,
} from './utils';
import { parseCodeBlockTitle, countLines } from './titleParser';
import { getLanguageConfig, isPreviewableLanguage } from './languageConfig';
import { getDefaultTab } from './tabSelector';
import { TitleView } from './TitleView';
import { DropdownMenu } from './DropdownMenu';
import type {
  CopyButtonProps,
  DownloadButtonProps,
  CodeBlockWithPreviewProps,
  CodeBlockTab,
  DownloadOption,
} from './types';

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
  ({ text, language, filename = 'code', onDownloadAsPng }) => {
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

    // Build download options
    const options: DownloadOption[] = useMemo(() => {
      const opts: DownloadOption[] = [
        {
          id: 'source',
          label: filename,
          icon: <FileText className="h-4 w-4" />,
          action: handleDownloadSource,
        },
      ];

      // Add PNG option for SVG/HTML
      const lowerLanguage = language.toLowerCase();
      const trimmedText = text.trim();
      const isSvgCode =
        lowerLanguage === 'svg' || (lowerLanguage === 'xml' && trimmedText.startsWith('<svg'));
      const isHtmlCode = lowerLanguage === 'html';

      if ((isSvgCode || isHtmlCode) && onDownloadAsPng) {
        opts.push({
          id: 'png',
          label: `Export as PNG`,
          icon: <ImageIcon className="h-4 w-4" />,
          action: handleDownloadAsPng,
        });
      }

      return opts;
    }, [filename, language, text, handleDownloadSource, handleDownloadAsPng, onDownloadAsPng]);

    return <DropdownMenu options={options} />;
  }
);
DownloadButton.displayName = 'DownloadButton';

export const CodeBlockWithPreview = memo<CodeBlockWithPreviewProps>(
  ({ children, className, language, context = '' }) => {
    const rawCode = useMemo(() => extractText(children).replace(/\n$/, ''), [children]);

    // Parse title and metadata
    const { filename, displayName, isExplicit } = useMemo(
      () => parseCodeBlockTitle(language, rawCode),
      [language, rawCode]
    );

    const lineCount = useMemo(() => countLines(rawCode), [rawCode]);
    const langConfig = useMemo(() => getLanguageConfig(language), [language]);

    // Preview detection
    const isSvg = useMemo(
      () => language === 'svg' || (language === 'xml' && rawCode.trim().startsWith('<svg')),
      [language, rawCode]
    );
    const canPreview = useMemo(
      () => isPreviewableLanguage(language) && !isMermaidLanguage(language),
      [language]
    );
    const isPreviewReady = useMemo(
      () => (canPreview ? isPreviewCodeComplete(rawCode, isSvg) : false),
      [canPreview, rawCode, isSvg]
    );

    // Get viewport width
    const [viewportWidth, setViewportWidth] = useState(1200);
    useEffect(() => {
      const handleResize = () => setViewportWidth(window.innerWidth);
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Determine default tab
    const initialTab = useMemo(() => {
      return getDefaultTab({
        category: langConfig.category,
        lineCount,
        isPreviewReady,
        viewportWidth,
      });
    }, [langConfig.category, lineCount, isPreviewReady, viewportWidth]);

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
      const bg = '#ffffff';
      const fg = '#1e293b';
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
    }, [rawCode, isSvg]);

    // Handle PNG download
    const handleDownloadAsPng = useCallback(async () => {
      const trimmedText = rawCode.trim();
      const isSvgCode =
        language.toLowerCase() === 'svg' ||
        (language.toLowerCase() === 'xml' && trimmedText.startsWith('<svg'));

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
    }, [rawCode, language, filename]);

    // Tab button handler
    const handleTabChange = useCallback((tab: CodeBlockTab) => {
      setActiveTab(tab);
    }, []);

    // Switch to code from title view
    const handleSwitchToCode = useCallback(() => {
      setActiveTab('code');
    }, []);

    return (
      <div className="relative group my-4 rounded-lg overflow-hidden border border-border bg-muted/30">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground lowercase font-mono">
              {language || 'code'}
            </span>

            {/* Tab buttons */}
            <div className="flex bg-background rounded-md p-0.5 border border-border">
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

          <div className="flex items-center gap-1">
            <DownloadButton
              text={rawCode}
              language={language}
              filename={filename}
              onDownloadAsPng={handleDownloadAsPng}
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
          <div className="bg-background overflow-hidden h-[50vh] min-h-[200px] max-h-[60vh] sm:h-[400px] resize-y relative rounded-b-lg border-t border-border">
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

// Helper function to check if language is mermaid
function isMermaidLanguage(language: string): boolean {
  return language.toLowerCase() === 'mermaid';
}
