/**
 * File validation constants for Cloudflare Workers
 * Defines allowed file types, size limits, and MIME type mappings
 */

export interface FileTypeConfig {
  mimeTypes: string[];
  extensions: string[];
  maxSize: number;
  magicNumber: number[];
}

/**
 * Maximum file size: 10MB
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Magic numbers (file headers) for common file types
 * Used to verify actual file content matches declared MIME type
 */
export const MAGIC_NUMBERS = {
  // Images
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF, needs additional validation
  'image/bmp': [0x42, 0x4D],
  'image/tiff': [0x49, 0x49, 0x2A, 0x00], // Little-endian TIFF
  'image/svg+xml': [0x3C, 0x73, 0x76, 0x67], // <svg

  // Documents
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF

  // Audio
  'audio/mpeg': [0xFF, 0xFB], // MP3
  'audio/wav': [0x52, 0x49, 0x46, 0x46], // RIFF (same as WebP, need additional checks)
  'audio/ogg': [0x4F, 0x67, 0x67, 0x53], // OggS

  // Video
  'video/mp4': [0x00, 0x00, 0x00], // ftyp (needs offset check)
  'video/webm': [0x1A, 0x45, 0xDF, 0xA3], // EBML

  // Archives
  'application/zip': [0x50, 0x4B, 0x03, 0x04], // PK..
  'application/x-tar': [0x75, 0x73, 0x74, 0x61, 0x72], // ustar

  // Text
  'text/plain': [], // No magic number, handled separately
  'text/csv': [],
  'application/json': [],
  'text/markdown': [],
} as const;

/**
 * MIME type to extension mapping
 */
export const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  // Images
  'image/jpeg': ['jpg', 'jpeg', 'jpe'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/bmp': ['bmp'],
  'image/tiff': ['tiff', 'tif'],
  'image/svg+xml': ['svg'],

  // Documents
  'application/pdf': ['pdf'],

  // Audio
  'audio/mpeg': ['mp3'],
  'audio/wav': ['wav'],
  'audio/ogg': ['ogg'],

  // Video
  'video/mp4': ['mp4', 'm4v'],
  'video/webm': ['webm'],

  // Archives
  'application/zip': ['zip'],
  'application/x-tar': ['tar'],

  // Text
  'text/plain': ['txt'],
  'text/csv': ['csv'],
  'application/json': ['json'],
  'text/markdown': ['md', 'markdown'],
};

/**
 * Extension to MIME type mapping
 */
export const EXTENSION_TO_MIME: Record<string, string> = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  svg: 'image/svg+xml',

  // Documents
  pdf: 'application/pdf',

  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',

  // Video
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',

  // Archives
  zip: 'application/zip',
  tar: 'application/x-tar',

  // Text
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  md: 'text/markdown',
  markdown: 'text/markdown',
};

/**
 * Allowed MIME types for upload
 * Add or remove types based on application requirements
 */
export const ALLOWED_MIME_TYPES = new Set<string>([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',

  // Documents
  'application/pdf',

  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',

  // Video
  'video/mp4',
  'video/webm',

  // Archives
  'application/zip',

  // Text
  'text/plain',
  'text/csv',
  'application/json',
  'text/markdown',
]);

/**
 * Allowed file extensions for upload
 */
export const ALLOWED_EXTENSIONS = new Set<string>([
  // Images
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',

  // Documents
  'pdf',

  // Audio
  'mp3', 'wav', 'ogg',

  // Video
  'mp4', 'webm',

  // Archives
  'zip',

  // Text
  'txt', 'csv', 'json', 'md',
]);

/**
 * MIME types that require magic number validation
 * Text-based files are excluded as they don't have reliable magic numbers
 */
export const MAGIC_NUMBER_REQUIRED = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'application/pdf',
  'audio/mpeg',
  'audio/ogg',
  'application/zip',
]);

/**
 * Maximum filename length (after sanitization)
 */
export const MAX_FILENAME_LENGTH = 255;

/**
 * Dangerous filename patterns to reject
 */
export const DANGEROUS_FILENAME_PATTERNS = [
  /\.\./,           // Path traversal
  /^\//,            // Absolute path
  /\0/,             // Null byte
  /[<>:"|?*]/,      // Windows reserved characters
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i, // Windows reserved names
];

/**
 * File type categories for grouping
 */
export const FILE_CATEGORIES = {
  image: new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff']),
  document: new Set(['application/pdf', 'text/plain', 'text/csv', 'application/json', 'text/markdown']),
  audio: new Set(['audio/mpeg', 'audio/wav', 'audio/ogg']),
  video: new Set(['video/mp4', 'video/webm']),
  archive: new Set(['application/zip', 'application/x-tar']),
} as const;
