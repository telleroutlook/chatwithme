import type { MessageFile } from '@chatwithme/shared';
import { FileText, FileCode, File } from 'lucide-react';
import type { ReactElement } from 'react';

/**
 * Code file extensions that support syntax highlighting
 */
export const CODE_EXTENSIONS = [
  'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs',
  'c', 'cpp', 'h', 'hpp', 'cs', 'rb', 'php', 'sh',
  'json', 'yaml', 'yml', 'toml', 'md', 'txt', 'csv'
] as const;

export type CodeExtension = typeof CODE_EXTENSIONS[number];

/**
 * Office document extensions
 * - Word documents (docx)
 * - Excel spreadsheets (xlsx, xls, xlsm, xlsb, csv, ods)
 * - PowerPoint presentations (pptx)
 */
export const OFFICE_EXTENSIONS = [
  'pptx',
  'xlsx',
  'xls',
  'xlsm',
  'xlsb',
  'docx',
  'ods'
] as const;

export type OfficeExtension = typeof OFFICE_EXTENSIONS[number];

/**
 * Type guard to check if a string is a code extension
 */
function isCodeExtension(ext: string): ext is CodeExtension {
  return CODE_EXTENSIONS.includes(ext as CodeExtension);
}

/**
 * Type guard to check if a string is an office extension
 */
function isOfficeExtension(ext: string): ext is OfficeExtension {
  return OFFICE_EXTENSIONS.includes(ext as OfficeExtension);
}

/**
 * Accepted file types for file input
 * Combines images, PDFs, code files, and office documents
 */
export const ACCEPTED_FILE_TYPES = [
  'image/*',
  '.pdf',
  ...CODE_EXTENSIONS.map(ext => `.${ext}`),
  ...OFFICE_EXTENSIONS.map(ext => `.${ext}`)
].join(',');

/**
 * Format file size in human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB", "500 KB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get file icon based on file type and extension
 * @param file - MessageFile object
 * @param size - Icon size class (default: "h-4 w-4")
 * @returns ReactElement with icon or null for images
 */
export function getFileIcon(file: MessageFile, size: 'h-4 w-4' | 'h-6 w-6' = 'h-4 w-4'): ReactElement | null {
  // Images don't get an icon, they are displayed directly
  if (file.mimeType.startsWith('image/')) return null;

  // PDF files get a red file text icon
  if (file.mimeType === 'application/pdf') {
    return <FileText className={`${size} text-red-400`} />;
  }

  const ext = file.fileName.split('.').pop()?.toLowerCase();

  // Code files get a blue code icon
  if (ext && isCodeExtension(ext)) {
    return <FileCode className={`${size} text-blue-400`} />;
  }

  // Office documents get colored icons
  if (ext && isOfficeExtension(ext)) {
    // Word documents - blue
    if (ext === 'docx') return <FileText className={`${size} text-blue-400`} />;
    // PowerPoint - orange
    if (ext === 'pptx') return <FileText className={`${size} text-orange-400`} />;
    // Excel spreadsheets - green
    if (['xlsx', 'xls', 'xlsm', 'xlsb', 'csv', 'ods'].includes(ext)) {
      return <FileText className={`${size} text-green-400`} />;
    }
    return <FileText className={`${size} text-blue-400`} />;
  }

  // Default gray file icon
  return <File className={`${size} text-gray-400`} />;
}

/**
 * Get file type based on MIME type and extension
 * @param file - File object from file input
 * @returns File type category
 */
export function getFileType(file: File): 'image' | 'pdf' | 'code' | 'text' | 'office' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('text/')) return 'text';

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext && isCodeExtension(ext)) return 'code';
  if (ext && isOfficeExtension(ext)) return 'office';

  return 'text';
}
