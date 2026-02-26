import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize filename by removing dangerous characters
 * Removes: < > : " / \ | ? * and control characters
 * Replaces spaces with underscores
 * Limits length to 255 characters
 * Returns a default name if result is empty
 */
export function sanitizeFileName(filename: string, defaultName: string = 'file.txt'): string {
  if (!filename || typeof filename !== 'string') {
    return defaultName;
  }

  // Remove control characters
  let sanitized = filename.replace(/[\x00-\x1f\x7f]/g, '');

  // Remove dangerous characters: < > : " / \ | ? *
  sanitized = sanitized.replace(/[<>:"/\\|?*]/g, '');

  // Replace spaces with underscores
  sanitized = sanitized.replace(/\s+/g, '_');

  // Remove leading/trailing dots and spaces
  sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '');

  // Limit length while preserving extension
  const maxLength = 255;
  if (sanitized.length > maxLength) {
    const lastDotIndex = sanitized.lastIndexOf('.');
    if (lastDotIndex > 0 && lastDotIndex < sanitized.length - 1) {
      // Has a valid extension
      const extension = sanitized.substring(lastDotIndex);
      const baseName = sanitized.substring(0, lastDotIndex);
      const maxBaseLength = maxLength - extension.length;

      if (maxBaseLength > 0) {
        sanitized = baseName.substring(0, maxBaseLength) + extension;
      } else {
        // Extension alone is too long, truncate to max length
        sanitized = sanitized.substring(0, maxLength);
      }
    } else {
      // No valid extension, just truncate
      sanitized = sanitized.substring(0, maxLength);
    }
  }

  // Return default name if empty
  if (!sanitized) {
    return defaultName;
  }

  return sanitized;
}
