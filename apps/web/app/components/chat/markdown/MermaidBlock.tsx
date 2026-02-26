import { memo, useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useThemeStore } from '~/stores/theme';
import { downloadSvgElementAsPng } from './utils';
import type { MermaidRendererProps } from './types';

export const MermaidRenderer = memo<MermaidRendererProps>(({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const { resolvedTheme } = useThemeStore();

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
          theme: resolvedTheme === 'dark' ? 'dark' : 'default',
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
  }, [chart, resolvedTheme]);

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
      <div className="p-4 overflow-x-auto relative min-h-[120px]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Rendering diagram...</span>
            </div>
          </div>
        )}
        <div ref={containerRef} className="mermaid-diagram" />
      </div>
    </div>
  );
});
MermaidRenderer.displayName = 'MermaidRenderer';
