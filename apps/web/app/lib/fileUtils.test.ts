import { describe, expect, it } from 'vitest';
import { formatFileSize, getFileIcon, getFileType, CODE_EXTENSIONS, OFFICE_EXTENSIONS } from './fileUtils';
import type { MessageFile } from '@chatwithme/shared';

// Mock file objects
const createMockFile = (name: string, mimeType: string): File => {
  return {
    name,
    type: mimeType,
  } as File;
};

// Mock MessageFile objects
const createMockMessageFile = (fileName: string, mimeType: string, size: number): MessageFile => ({
  url: 'https://example.com/file',
  fileName,
  mimeType,
  size,
});

describe('formatFileSize', () => {
  it('returns bytes for values less than 1024', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('returns kilobytes for values less than 1 MB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(5120)).toBe('5.0 KB');
    expect(formatFileSize(1024 * 100)).toBe('100.0 KB');
    expect(formatFileSize(1024 * 1023)).toBe('1023.0 KB');
  });

  it('returns megabytes for values 1 MB and above', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(1024 * 1024 * 5)).toBe('5.0 MB');
    expect(formatFileSize(1024 * 1024 * 10.5)).toBe('10.5 MB');
  });

  it('handles edge cases', () => {
    expect(formatFileSize(1)).toBe('1 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });
});

describe('getFileType', () => {
  it('returns "image" for image MIME types', () => {
    const imageFile = createMockFile('photo.jpg', 'image/jpeg');
    expect(getFileType(imageFile)).toBe('image');

    const pngFile = createMockFile('image.png', 'image/png');
    expect(getFileType(pngFile)).toBe('image');
  });

  it('returns "pdf" for PDF files', () => {
    const pdfFile = createMockFile('document.pdf', 'application/pdf');
    expect(getFileType(pdfFile)).toBe('pdf');
  });

  it('returns "text" for text MIME types', () => {
    const textFile = createMockFile('notes.txt', 'text/plain');
    expect(getFileType(textFile)).toBe('text');
  });

  it('returns "code" for code file extensions', () => {
    // JS with application/javascript (not text/*)
    const jsFile = createMockFile('script.js', 'application/javascript');
    expect(getFileType(jsFile)).toBe('code');

    // Files with text/* MIME types return 'text' first (MIME type priority)
    const tsFile = createMockFile('component.ts', 'text/typescript');
    expect(getFileType(tsFile)).toBe('text'); // text/* has priority

    // Code files without text/* MIME type
    const pyFile = createMockFile('app.py', 'application/x-python');
    expect(getFileType(pyFile)).toBe('code');

    // Code files with unknown/empty MIME type
    const jsxFile = createMockFile('component.jsx', '');
    expect(getFileType(jsxFile)).toBe('code');
  });

  it('returns "office" for office document extensions', () => {
    const docxFile = createMockFile('report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(getFileType(docxFile)).toBe('office');

    const xlsxFile = createMockFile('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(getFileType(xlsxFile)).toBe('office');

    const pptxFile = createMockFile('slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(getFileType(pptxFile)).toBe('office');
  });

  it('defaults to "text" for unknown types', () => {
    const unknownFile = createMockFile('unknown.bin', 'application/octet-stream');
    expect(getFileType(unknownFile)).toBe('text');
  });
});

describe('getFileIcon', () => {
  it('returns null for image files', () => {
    const imageFile = createMockMessageFile('photo.jpg', 'image/jpeg', 1024);
    const icon = getFileIcon(imageFile);

    expect(icon).toBeNull();
  });

  it('returns FileText icon for PDF files', () => {
    const pdfFile = createMockMessageFile('document.pdf', 'application/pdf', 1024);
    const icon = getFileIcon(pdfFile);

    expect(icon).not.toBeNull();
    // Icon should have red color class for PDF
    expect((icon as any)?.props.className).toContain('text-red-400');
  });

  it('returns FileCode icon for code files', () => {
    const jsFile = createMockMessageFile('script.js', 'text/javascript', 512);
    const icon = getFileIcon(jsFile);

    expect(icon).not.toBeNull();
    // Code files get blue color
    expect((icon as any)?.props.className).toContain('text-blue-400');
  });

  it('returns blue icon for Word documents (docx)', () => {
    const docxFile = createMockMessageFile('report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1024);
    const icon = getFileIcon(docxFile);

    expect(icon).not.toBeNull();
    expect((icon as any)?.props.className).toContain('text-blue-400');
  });

  it('returns orange icon for PowerPoint presentations (pptx)', () => {
    const pptxFile = createMockMessageFile('slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 1024);
    const icon = getFileIcon(pptxFile);

    expect(icon).not.toBeNull();
    expect((icon as any)?.props.className).toContain('text-orange-400');
  });

  it('returns green icon for Excel spreadsheets', () => {
    const xlsxFile = createMockMessageFile('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1024);
    const icon = getFileIcon(xlsxFile);

    expect(icon).not.toBeNull();
    expect((icon as any)?.props.className).toContain('text-green-400');
  });

  it('returns blue icon for CSV files (CSV is in CODE_EXTENSIONS)', () => {
    // CSV files with text/csv MIME type get code icon (blue) since CSV is in CODE_EXTENSIONS
    const csvFile = createMockMessageFile('data.csv', 'text/csv', 1024);
    const icon = getFileIcon(csvFile);

    expect(icon).not.toBeNull();
    expect((icon as any)?.props.className).toContain('text-blue-400');
  });

  it('returns green icon for other Excel formats', () => {
    const xlsFile = createMockMessageFile('data.xls', 'application/vnd.ms-excel', 1024);
    const icon = getFileIcon(xlsFile);

    expect(icon).not.toBeNull();
    expect((icon as any)?.props.className).toContain('text-green-400');
  });

  it('returns gray icon for unknown file types', () => {
    const unknownFile = createMockMessageFile('unknown.bin', 'application/octet-stream', 1024);
    const icon = getFileIcon(unknownFile);

    expect(icon).not.toBeNull();
    expect((icon as any)?.props.className).toContain('text-gray-400');
  });

  it('respects size parameter', () => {
    const pdfFile = createMockMessageFile('document.pdf', 'application/pdf', 1024);

    const smallIcon = getFileIcon(pdfFile, 'h-4 w-4');
    expect((smallIcon as any)?.props.className).toContain('h-4 w-4');

    const largeIcon = getFileIcon(pdfFile, 'h-6 w-6');
    expect((largeIcon as any)?.props.className).toContain('h-6 w-6');
  });
});

describe('CODE_EXTENSIONS constant', () => {
  it('contains common code extensions', () => {
    expect(CODE_EXTENSIONS).toContain('js');
    expect(CODE_EXTENSIONS).toContain('ts');
    expect(CODE_EXTENSIONS).toContain('jsx');
    expect(CODE_EXTENSIONS).toContain('tsx');
    expect(CODE_EXTENSIONS).toContain('py');
    expect(CODE_EXTENSIONS).toContain('java');
    expect(CODE_EXTENSIONS).toContain('go');
    expect(CODE_EXTENSIONS).toContain('rs');
  });

  it('contains markup and data formats', () => {
    expect(CODE_EXTENSIONS).toContain('json');
    expect(CODE_EXTENSIONS).toContain('yaml');
    expect(CODE_EXTENSIONS).toContain('yml');
    expect(CODE_EXTENSIONS).toContain('md');
    expect(CODE_EXTENSIONS).toContain('csv');
  });
});

describe('OFFICE_EXTENSIONS constant', () => {
  it('contains Word extensions', () => {
    expect(OFFICE_EXTENSIONS).toContain('docx');
  });

  it('contains Excel extensions', () => {
    expect(OFFICE_EXTENSIONS).toContain('xlsx');
    expect(OFFICE_EXTENSIONS).toContain('xls');
    expect(OFFICE_EXTENSIONS).toContain('xlsm');
    expect(OFFICE_EXTENSIONS).toContain('xlsb');
    expect(OFFICE_EXTENSIONS).toContain('ods');
    // Note: 'csv' is in CODE_EXTENSIONS, not OFFICE_EXTENSIONS
  });

  it('contains PowerPoint extensions', () => {
    expect(OFFICE_EXTENSIONS).toContain('pptx');
  });
});
