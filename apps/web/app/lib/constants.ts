/**
 * File size limits for uploads
 * All values are in bytes
 */
export const FILE_SIZE_LIMITS = {
  /** Maximum size for image files (10 MB) */
  IMAGE: 10 * 1024 * 1024,
  /** Maximum size for document files (10 MB) */
  DOCUMENT: 10 * 1024 * 1024,
} as const;

/**
 * Processing limits for file extraction
 */
export const PROCESSING_LIMITS = {
  /** Maximum number of PDF pages to extract text from */
  PDF_MAX_PAGES: 50,
} as const;
