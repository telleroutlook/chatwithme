/**
 * Tab selector for code blocks
 * Determines the default active tab based on language, line count, and viewport
 */

import type { LanguageCategory } from './languageConfig';

export type CodeBlockTab = 'title' | 'code' | 'preview';

interface TabSelectorConfig {
  category: LanguageCategory;
  lineCount: number;
  isPreviewReady: boolean;
  viewportWidth: number;
}

/**
 * Get the default tab for a code block
 * Priority rules (from highest to lowest):
 * 1. Mermaid → Preview
 * 2. Vega-Lite → Preview
 * 3. Markdown → Preview
 * 4. Previewable AND preview ready → Preview
 * 5. Viewport < 640px AND programming → Title
 * 6. Programming AND lineCount <= 12 → Code
 * 7. Programming AND lineCount > 50 → Title
 * 8. Plaintext → Code
 * 9. Other → Title
 */
export function getDefaultTab(config: TabSelectorConfig): CodeBlockTab {
  const { category, lineCount, isPreviewReady, viewportWidth } = config;

  // Rule 1: Mermaid always shows preview
  if (category === 'mermaid') {
    return 'preview';
  }

  // Rule 2: Vega-Lite always shows preview
  if (category === 'vegalite') {
    return 'preview';
  }

  // Rule 3: Markdown always shows preview
  if (category === 'markdown') {
    return 'preview';
  }

  // Rule 4: Previewable content with ready preview
  if (category === 'previewable' && isPreviewReady) {
    return 'preview';
  }

  // Rule 3: Mobile viewport for programming languages
  const isMobile = viewportWidth < 640;
  if (category === 'programming' && isMobile) {
    return 'title';
  }

  // Rule 4: Short code blocks avoid extra click
  if (category === 'programming' && lineCount <= 12) {
    return 'code';
  }

  // Rule 5: Long code blocks default to title
  if (category === 'programming' && lineCount > 50) {
    return 'title';
  }

  // Rule 6: Plaintext always shows code
  if (category === 'plaintext') {
    return 'code';
  }

  // Rule 7: Default to title for everything else
  return 'title';
}

/**
 * Check if a tab transition is valid
 */
export function isValidTabTransition(_from: CodeBlockTab, _to: CodeBlockTab): boolean {
  // All transitions are valid
  return true;
}

/**
 * Get tab label for display
 */
export function getTabLabel(tab: CodeBlockTab): string {
  switch (tab) {
    case 'title':
      return 'Title';
    case 'code':
      return 'Code';
    case 'preview':
      return 'Preview';
  }
}
