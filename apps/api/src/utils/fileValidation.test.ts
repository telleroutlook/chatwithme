/**
 * File validation utilities tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateFileByMagicNumber,
  sanitizeFileName,
  validateFileName,
  validateFileExtension,
  getMimeTypeFromExtension,
  validateMimeTypeMatchesExtension,
  detectMimeTypeFromBuffer,
  getFileExtension,
  validateFileSize,
  formatFileSize,
} from './fileValidation';
import { ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../constants/fileValidation';

describe('validateFileByMagicNumber', () => {
  it('should validate JPEG files', () => {
    const jpegBuffer = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]).buffer;
    expect(validateFileByMagicNumber(jpegBuffer, 'image/jpeg')).toBe(true);
  });

  it('should validate PNG files', () => {
    const pngBuffer = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).buffer;
    expect(validateFileByMagicNumber(pngBuffer, 'image/png')).toBe(true);
  });

  it('should validate PDF files', () => {
    const pdfBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]).buffer;
    expect(validateFileByMagicNumber(pdfBuffer, 'application/pdf')).toBe(true);
  });

  it('should reject invalid JPEG magic number', () => {
    const invalidBuffer = new Uint8Array([0x00, 0x00, 0x00, 0x00]).buffer;
    expect(validateFileByMagicNumber(invalidBuffer, 'image/jpeg')).toBe(false);
  });

  it('should validate WebP files with RIFF header', () => {
    const webpBuffer = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]).buffer;
    expect(validateFileByMagicNumber(webpBuffer, 'image/webp')).toBe(true);
  });

  it('should validate WAV files with RIFF header', () => {
    const wavBuffer = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x41, 0x56, 0x45, // WAVE
    ]).buffer;
    expect(validateFileByMagicNumber(wavBuffer, 'audio/wav')).toBe(true);
  });
});

describe('detectMimeTypeFromBuffer', () => {
  it('should detect JPEG', () => {
    const buffer = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]).buffer;
    expect(detectMimeTypeFromBuffer(buffer)).toBe('image/jpeg');
  });

  it('should detect PNG', () => {
    const buffer = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).buffer;
    expect(detectMimeTypeFromBuffer(buffer)).toBe('image/png');
  });

  it('should detect PDF', () => {
    const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    expect(detectMimeTypeFromBuffer(buffer)).toBe('application/pdf');
  });

  it('should return null for unknown type', () => {
    const buffer = new Uint8Array([0x00, 0x00, 0x00, 0x00]).buffer;
    expect(detectMimeTypeFromBuffer(buffer)).toBeNull();
  });
});

describe('sanitizeFileName', () => {
  it('should remove path traversal attempts', () => {
    expect(sanitizeFileName('../../../etc/passwd')).toBe('passwd');
  });

  it('should remove null bytes', () => {
    expect(sanitizeFileName('test\x00file.txt')).toBe('testfile.txt');
  });

  it('should remove Windows reserved characters', () => {
    expect(sanitizeFileName('test<>:|"?*file.txt')).toBe('testfile.txt');
  });

  it('should preserve valid filenames', () => {
    expect(sanitizeFileName('document.pdf')).toBe('document.pdf');
  });

  it('should handle backslashes', () => {
    expect(sanitizeFileName('folder\\file.txt')).toBe('file.txt');
  });

  it('should return "file" for empty filename', () => {
    expect(sanitizeFileName('')).toBe('file');
  });

  it('should trim leading/trailing whitespace', () => {
    expect(sanitizeFileName('  test.txt  ')).toBe('test.txt');
  });
});

describe('validateFileName', () => {
  it('should reject empty filename', () => {
    expect(validateFileName('')).toEqual({
      valid: false,
      reason: 'Filename cannot be empty',
    });
  });

  it('should reject path traversal', () => {
    expect(validateFileName('../test.txt')).toEqual({
      valid: false,
      reason: 'Filename contains invalid characters',
    });
  });

  it('should reject absolute paths', () => {
    expect(validateFileName('/etc/passwd')).toEqual({
      valid: false,
      reason: 'Filename contains invalid characters',
    });
  });

  it('should reject filenames with null bytes', () => {
    expect(validateFileName('test\x00.txt')).toEqual({
      valid: false,
      reason: 'Filename contains invalid characters',
    });
  });

  it('should accept valid filename', () => {
    expect(validateFileName('document.pdf')).toEqual({ valid: true });
  });
});

describe('validateFileExtension', () => {
  it('should accept allowed extensions', () => {
    expect(validateFileExtension('test.jpg', ALLOWED_EXTENSIONS)).toBe(true);
    expect(validateFileExtension('test.png', ALLOWED_EXTENSIONS)).toBe(true);
    expect(validateFileExtension('test.pdf', ALLOWED_EXTENSIONS)).toBe(true);
  });

  it('should reject disallowed extensions', () => {
    expect(validateFileExtension('test.exe', ALLOWED_EXTENSIONS)).toBe(false);
    expect(validateFileExtension('test.bat', ALLOWED_EXTENSIONS)).toBe(false);
  });

  it('should reject files without extension', () => {
    expect(validateFileExtension('test', ALLOWED_EXTENSIONS)).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(validateFileExtension('test.JPG', ALLOWED_EXTENSIONS)).toBe(true);
    expect(validateFileExtension('test.PDF', ALLOWED_EXTENSIONS)).toBe(true);
  });
});

describe('getMimeTypeFromExtension', () => {
  it('should return correct MIME types', () => {
    expect(getMimeTypeFromExtension('jpg')).toBe('image/jpeg');
    expect(getMimeTypeFromExtension('png')).toBe('image/png');
    expect(getMimeTypeFromExtension('pdf')).toBe('application/pdf');
  });

  it('should return null for unknown extension', () => {
    expect(getMimeTypeFromExtension('exe')).toBeNull();
  });

  it('should be case insensitive', () => {
    expect(getMimeTypeFromExtension('JPG')).toBe('image/jpeg');
  });
});

describe('validateMimeTypeMatchesExtension', () => {
  it('should accept matching MIME type and extension', () => {
    expect(validateMimeTypeMatchesExtension('image/jpeg', 'photo.jpg')).toBe(true);
    expect(validateMimeTypeMatchesExtension('image/png', 'photo.png')).toBe(true);
    expect(validateMimeTypeMatchesExtension('application/pdf', 'doc.pdf')).toBe(true);
  });

  it('should reject mismatched MIME type and extension', () => {
    expect(validateMimeTypeMatchesExtension('image/jpeg', 'photo.png')).toBe(false);
    expect(validateMimeTypeMatchesExtension('application/pdf', 'photo.jpg')).toBe(false);
  });

  it('should reject files without extension', () => {
    expect(validateMimeTypeMatchesExtension('image/jpeg', 'photo')).toBe(false);
  });
});

describe('getFileExtension', () => {
  it('should extract extension', () => {
    expect(getFileExtension('document.pdf')).toBe('pdf');
    expect(getFileExtension('photo.jpg')).toBe('jpg');
  });

  it('should handle multiple dots', () => {
    expect(getFileExtension('archive.tar.gz')).toBe('gz');
  });

  it('should return empty string for files without extension', () => {
    expect(getFileExtension('README')).toBe('');
  });

  it('should be case insensitive', () => {
    expect(getFileExtension('document.PDF')).toBe('pdf');
  });
});

describe('validateFileSize', () => {
  it('should accept files within limit', () => {
    expect(validateFileSize(1024, MAX_FILE_SIZE)).toBe(true);
    expect(validateFileSize(MAX_FILE_SIZE, MAX_FILE_SIZE)).toBe(true);
  });

  it('should reject files exceeding limit', () => {
    expect(validateFileSize(MAX_FILE_SIZE + 1, MAX_FILE_SIZE)).toBe(false);
  });

  it('should reject zero size', () => {
    expect(validateFileSize(0, MAX_FILE_SIZE)).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('should format bytes', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
    expect(formatFileSize(512)).toBe('512 Bytes');
  });

  it('should format KB', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(2048)).toBe('2 KB');
  });

  it('should format MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('should format GB', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
  });
});
