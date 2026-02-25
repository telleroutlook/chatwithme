import { memo, useState, useEffect, useMemo } from 'react';
import { Copy, Check, Download, Eye, Code, Sun, Moon } from 'lucide-react';
import { cn } from '~/lib/utils';
import { downloadSvgElementAsPng, extractText, isPreviewCodeComplete } from './utils';
import type { CopyButtonProps, DownloadButtonProps, CodeBlockWithPreviewProps } from './types';

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

export const DownloadButton = memo<DownloadButtonProps>(({ text, language }) => {
  const saveAsTextFile = () => {
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

  const handleDownload = async () => {
    const trimmedText = text.trim();
    const isSvgCode = language.toLowerCase() === 'svg'
      || (language.toLowerCase() === 'xml' && trimmedText.startsWith('<svg'));

    if (isSvgCode) {
      try {
        const parsed = new DOMParser().parseFromString(trimmedText, 'image/svg+xml');
        const svgElement = parsed.querySelector('svg');
        const parseError = parsed.querySelector('parsererror');

        if (!svgElement || parseError) {
          throw new Error('Invalid SVG markup');
        }

        await downloadSvgElementAsPng(svgElement as unknown as SVGSVGElement, 'code_snippet.png');
        return;
      } catch {
        saveAsTextFile();
        return;
      }
    }

    saveAsTextFile();
  };

  return (
    <button
      onClick={() => void handleDownload()}
      className="p-1.5 text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-md transition-all"
      title="Download file"
      aria-label="Download code"
    >
      <Download className="h-4 w-4" />
    </button>
  );
});
DownloadButton.displayName = 'DownloadButton';

export const CodeBlockWithPreview = memo<CodeBlockWithPreviewProps>(
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
