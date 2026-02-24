import { memo, useEffect, useRef } from 'react';
import { cn } from '~/lib/utils';
import type { KatexRendererProps } from './types';

export const KatexRenderer = memo<KatexRendererProps>(({ math, inline = false }) => {
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
