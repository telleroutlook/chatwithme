/**
 * Copy text to clipboard with fallback for older browsers
 * @param text - The text to copy
 * @returns Promise<boolean> - True if copy was successful
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern clipboard API first
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn('Clipboard API failed, falling back to execCommand:', error);
      // Fall through to fallback method
    }
  }

  // Fallback to document.execCommand for older browsers
  return fallbackCopyToClipboard(text);
}

/**
 * Fallback copy method using document.execCommand
 * @param text - The text to copy
 * @returns boolean - True if copy was successful
 */
function fallbackCopyToClipboard(text: string): boolean {
  const textarea = document.createElement('textarea');
  let success = false;

  try {
    // Prepare textarea for copying
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '2em';
    textarea.style.height = '2em';
    textarea.style.padding = '0';
    textarea.style.border = 'none';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.background = 'transparent';
    textarea.style.opacity = '0.01';

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    // Execute copy command
    success = document.execCommand('copy');
  } catch (error) {
    console.error('Fallback copy to clipboard failed:', error);
    success = false;
  } finally {
    // Clean up
    if (document.body.contains(textarea)) {
      document.body.removeChild(textarea);
    }
  }

  return success;
}
