/**
 * File validation utilities for Cloudflare Workers
 * Provides magic number detection, MIME type validation, and filename sanitization
 */

import {
  MAGIC_NUMBERS,
  MIME_TO_EXTENSIONS,
  EXTENSION_TO_MIME,
  ALLOWED_MIME_TYPES as _ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS as _ALLOWED_EXTENSIONS,
  MAGIC_NUMBER_REQUIRED,
  MAX_FILENAME_LENGTH,
  DANGEROUS_FILENAME_PATTERNS,
} from '../constants/fileValidation';

/**
 * Validation result interface
 */
export interface FileValidationResult {
  valid: boolean;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Check if file header matches expected magic number
 */
export function validateFileByMagicNumber(buffer: ArrayBuffer, expectedMimeType: string): boolean {
  const bytes = new Uint8Array(buffer);

  switch (expectedMimeType) {
    case 'image/webp':
    case 'audio/wav':
      // Both use RIFF, need additional validation
      if (bytes.length < 12) return false;
      // RIFF header
      if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46)
        return false;
      // Check type identifier at offset 8
      if (expectedMimeType === 'image/webp') {
        return bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50; // WEBP
      }
      if (expectedMimeType === 'audio/wav') {
        return bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45; // WAVE
      }
      return false;

    case 'video/mp4':
      // MP4 ftyp box at offset 4
      if (bytes.length < 12) return false;
      return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70; // ftyp

    case 'image/svg+xml':
    case 'text/plain':
    case 'text/csv':
    case 'application/json':
    case 'text/markdown':
      // Text-based files: check if content is valid UTF-8 text
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
        decoder.decode(bytes.slice(0, Math.min(1024, bytes.length)));
        return true;
      } catch {
        return false;
      }

    default: {
      // Standard magic number check
      const magicNumber = MAGIC_NUMBERS[expectedMimeType as keyof typeof MAGIC_NUMBERS];
      if (!magicNumber || magicNumber.length === 0) {
        // No magic number defined for this type
        return !MAGIC_NUMBER_REQUIRED.has(expectedMimeType);
      }

      if (bytes.length < magicNumber.length) {
        return false;
      }

      for (let i = 0; i < magicNumber.length; i++) {
        if (bytes[i] !== magicNumber[i]) {
          return false;
        }
      }
      return true;
    }
  }
}

/**
 * Detect MIME type from file header
 */
export function detectMimeTypeFromBuffer(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer);

  // Quick checks for common types
  if (bytes.length < 4) return null;

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }

  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }

  // PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }

  // ZIP
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return 'application/zip';
  }

  // RIFF (WAV or WebP)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    if (bytes.length >= 12) {
      if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        return 'image/webp';
      }
      if (bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
        return 'audio/wav';
      }
    }
    return null;
  }

  // WebM/EBML
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'video/webm';
  }

  // BMP
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }

  // TIFF (little-endian)
  if (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) {
    return 'image/tiff';
  }

  // TIFF (big-endian)
  if (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a) {
    return 'image/tiff';
  }

  // OGG
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'audio/ogg';
  }

  // MP3
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }

  // SVG
  if (bytes.length >= 4) {
    const text = new TextDecoder().decode(bytes.slice(0, Math.min(100, bytes.length)));
    if (text.trim().startsWith('<svg')) {
      return 'image/svg+xml';
    }
  }

  return null;
}

/**
 * Sanitize filename to prevent path traversal and other attacks
 */
export function sanitizeFileName(fileName: string): string {
  // Remove directory paths
  let sanitized = fileName.split(/[/\\]/).pop() || fileName;

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove Windows reserved characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, '');

  // Trim whitespace and dots
  sanitized = sanitized.trim().trim();

  // Limit length
  if (sanitized.length > MAX_FILENAME_LENGTH) {
    const extIndex = sanitized.lastIndexOf('.');
    if (extIndex > 0) {
      const ext = sanitized.slice(extIndex);
      const name = sanitized.slice(0, extIndex);
      sanitized = name.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
    } else {
      sanitized = sanitized.slice(0, MAX_FILENAME_LENGTH);
    }
  }

  // Ensure filename is not empty
  if (!sanitized) {
    sanitized = 'file';
  }

  return sanitized;
}

/**
 * Validate filename for dangerous patterns
 */
export function validateFileName(fileName: string): { valid: boolean; reason?: string } {
  if (!fileName || fileName.trim().length === 0) {
    return { valid: false, reason: 'Filename cannot be empty' };
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_FILENAME_PATTERNS) {
    if (pattern.test(fileName)) {
      return { valid: false, reason: 'Filename contains invalid characters' };
    }
  }

  // Check length
  if (fileName.length > MAX_FILENAME_LENGTH) {
    return { valid: false, reason: `Filename exceeds ${MAX_FILENAME_LENGTH} characters` };
  }

  return { valid: true };
}

/**
 * Validate file extension
 */
export function validateFileExtension(fileName: string, allowedExtensions: Set<string>): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) {
    return false;
  }
  return allowedExtensions.has(ext);
}

/**
 * Get file extension from filename
 */
export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(extension: string): string | null {
  return EXTENSION_TO_MIME[extension.toLowerCase()] || null;
}

/**
 * Check if declared MIME type matches file extension
 */
export function validateMimeTypeMatchesExtension(
  declaredMimeType: string,
  fileName: string
): boolean {
  const ext = getFileExtension(fileName);
  if (!ext) {
    return false;
  }

  const expectedMimeType = getMimeTypeFromExtension(ext);
  if (!expectedMimeType) {
    return false;
  }

  // For types with multiple possible MIME types, check if declared type is valid
  const validTypes = MIME_TO_EXTENSIONS[declaredMimeType];
  if (validTypes) {
    return validTypes.includes(ext);
  }

  return declaredMimeType === expectedMimeType;
}

/**
 * Get all valid extensions for a MIME type
 */
export function getExtensionsForMimeType(mimeType: string): string[] {
  return MIME_TO_EXTENSIONS[mimeType] || [];
}

/**
 * Validate file size
 */
export function validateFileSize(size: number, maxSize: number): boolean {
  return size > 0 && size <= maxSize;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Comprehensive file validation
 */
export async function validateUploadedFile(
  file: File,
  maxSize: number,
  allowedMimeTypes: Set<string>,
  allowedExtensions: Set<string>
): Promise<FileValidationResult> {
  // 1. Validate filename
  const fileNameValidation = validateFileName(file.name);
  if (!fileNameValidation.valid) {
    return {
      valid: false,
      error: {
        code: 'INVALID_FILE_NAME',
        message: fileNameValidation.reason || 'Invalid filename',
      },
    };
  }

  // 2. Validate file size
  if (!validateFileSize(file.size, maxSize)) {
    return {
      valid: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `File size exceeds ${formatFileSize(maxSize)} limit`,
      },
    };
  }

  // 3. Validate MIME type is allowed
  if (!allowedMimeTypes.has(file.type)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_FILE_TYPE',
        message: `File type ${file.type} is not allowed`,
      },
    };
  }

  // 4. Validate extension is allowed
  const ext = getFileExtension(file.name);
  if (!ext || !allowedExtensions.has(ext)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_FILE_TYPE',
        message: `File extension .${ext} is not allowed`,
      },
    };
  }

  // 5. Validate MIME type matches extension
  if (!validateMimeTypeMatchesExtension(file.type, file.name)) {
    return {
      valid: false,
      error: {
        code: 'MIME_TYPE_MISMATCH',
        message: `File extension .${ext} does not match declared MIME type ${file.type}`,
      },
    };
  }

  // 6. Validate file content (magic number) if required
  if (MAGIC_NUMBER_REQUIRED.has(file.type)) {
    try {
      const buffer = await file.arrayBuffer();
      if (!validateFileByMagicNumber(buffer, file.type)) {
        // Try to detect the actual type
        const detectedType = detectMimeTypeFromBuffer(buffer);
        const detectedMsg = detectedType ? ` (detected: ${detectedType})` : '';

        return {
          valid: false,
          error: {
            code: 'MALFORMED_FILE',
            message: `File content does not match declared type ${file.type}${detectedMsg}`,
          },
        };
      }
    } catch {
      return {
        valid: false,
        error: {
          code: 'MALFORMED_FILE',
          message: 'Failed to validate file content',
        },
      };
    }
  }

  return { valid: true };
}
