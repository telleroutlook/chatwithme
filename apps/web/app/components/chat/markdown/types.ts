import type { ReactNode } from 'react';

export interface KatexRendererProps {
  math: string;
  inline?: boolean;
}

export interface MermaidRendererProps {
  chart: string;
}

export interface CopyButtonProps {
  text: string;
}

export interface DownloadButtonProps {
  text: string;
  language: string;
}

export interface CodeBlockWithPreviewProps {
  children: ReactNode;
  className?: string;
  language: string;
}

export interface MarkdownRendererProps {
  content: string;
  className?: string;
}
