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
  filename?: string;
  onDownloadAsPng?: () => void;
}

export interface CodeBlockWithPreviewProps {
  children: ReactNode;
  className?: string;
  language: string;
  context?: string;
}

export interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Tab types
export type CodeBlockTab = 'title' | 'code' | 'preview';

// Language category
export type LanguageCategory = 'previewable' | 'plaintext' | 'programming' | 'mermaid';

// Language configuration
export interface LanguageConfig {
  category: LanguageCategory;
  extension: string;
  displayName: string;
}

// Code block metadata
export interface CodeBlockMeta {
  language: string;
  filename: string;
  displayName: string;
  lineCount: number;
  category: LanguageCategory;
}

// Parsed title
export interface ParsedTitle {
  filename: string;
  displayName: string;
  isExplicit: boolean;
}

// Download option
export interface DownloadOption {
  id: string;
  label: string;
  icon: ReactNode;
  action: () => void | Promise<void>;
}
