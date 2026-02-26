/**
 * Web Worker for processing file text extraction
 * Offloads CPU-intensive work from the main thread
 */

// Import constants from shared utilities
// Note: Workers use a different import path resolution
import { PROCESSING_LIMITS } from '../lib/constants';

// Code and Office extensions - duplicated here since workers can't easily import from TSX files
const CODE_EXTENSIONS = [
  'js',
  'ts',
  'jsx',
  'tsx',
  'py',
  'java',
  'go',
  'rs',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'rb',
  'php',
  'sh',
  'json',
  'yaml',
  'yml',
  'toml',
  'md',
  'txt',
  'csv',
];
const OFFICE_EXTENSIONS = ['pptx', 'xlsx', 'xls', 'xlsm', 'xlsb', 'docx', 'ods'];

interface ProcessFileRequest {
  type: 'processFile';
  file: File;
  dataUrl: string;
}

interface ProcessFilesRequest {
  type: 'processFiles';
  files: Array<{ file: File; dataUrl: string }>;
}

type WorkerRequest = ProcessFileRequest | ProcessFilesRequest;

interface MessageFile {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  extractedText?: string;
}

interface ProgressMessage {
  type: 'progress';
  fileIndex: number;
  fileName: string;
  progress: number; // 0 to 1
}

// DOCX text extraction
async function extractDocxText(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    if (onProgress) onProgress(0.3);
    const arrayBuffer = await file.arrayBuffer();
    if (onProgress) onProgress(0.6);
    // @ts-expect-error - mammoth dynamic import
    const mammothModule = await import('mammoth/mammoth.browser.js');
    const mammoth = mammothModule.default || mammothModule;
    if (onProgress) onProgress(0.8);
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (onProgress) onProgress(1);
    return result.value;
  } catch (error) {
    console.error('[Worker] DOCX extraction error:', error);
    return '';
  }
}

// XLSX text extraction
async function extractXlsxText(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    if (onProgress) onProgress(0.2);
    const arrayBuffer = await file.arrayBuffer();
    if (onProgress) onProgress(0.4);
    const xlsxModule = await import('xlsx');

    type XLSXType = {
      read: (data: unknown) => {
        SheetNames: string[];
        Sheets: Record<string, unknown>;
      };
      utils: {
        sheet_to_json: (sheet: unknown, options: unknown) => unknown[][];
      };
    };

    let XLSX: XLSXType | unknown;
    if (xlsxModule && typeof (xlsxModule as { read?: unknown }).read === 'function') {
      XLSX = xlsxModule;
    } else if (
      xlsxModule.default &&
      typeof (xlsxModule.default as { read?: unknown }).read === 'function'
    ) {
      XLSX = xlsxModule.default;
    } else if (
      xlsxModule.default &&
      (xlsxModule.default as { default?: { read?: unknown } }).default &&
      typeof (xlsxModule.default as unknown as { default: { read?: unknown } }).default.read ===
        'function'
    ) {
      XLSX = (xlsxModule.default as unknown as { default: { read?: unknown } }).default;
    } else {
      XLSX = xlsxModule;
    }

    if (!XLSX || typeof (XLSX as XLSXType).read !== 'function') {
      throw new Error('XLSX library not loaded correctly');
    }

    if (onProgress) onProgress(0.6);
    const workbook = (XLSX as XLSXType).read(arrayBuffer);
    let text = '';
    const totalSheets = workbook.SheetNames.length;

    (workbook.SheetNames as string[]).forEach((sheetName: string, index: number) => {
      const worksheet = workbook.Sheets[sheetName];
      if (
        !(XLSX as XLSXType).utils ||
        typeof (XLSX as XLSXType).utils.sheet_to_json !== 'function'
      ) {
        return;
      }
      const jsonData = (XLSX as XLSXType).utils.sheet_to_json(worksheet, {
        header: 1,
      }) as unknown[][];
      text += `\n\n--- Sheet: ${sheetName} (${jsonData.length} rows) ---\n`;
      jsonData.forEach((row) => {
        text += row.join('\t') + '\n';
      });

      // Update progress based on sheets processed
      if (onProgress) {
        const progress = 0.6 + (0.4 * (index + 1)) / totalSheets;
        onProgress(Math.min(progress, 0.95));
      }
    });

    if (onProgress) onProgress(1);
    return text;
  } catch (error) {
    console.error('[Worker] XLSX extraction error:', error);
    return '';
  }
}

// PPTX text extraction
async function extractPptxText(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    if (onProgress) onProgress(0.2);
    const arrayBuffer = await file.arrayBuffer();
    if (onProgress) onProgress(0.4);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(arrayBuffer);

    let text = '';
    const slideFiles = Object.keys(zip.files).filter(
      (name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
    );
    const totalSlides = slideFiles.length;

    for (let i = 0; i < slideFiles.length; i++) {
      const slideFile = slideFiles[i];
      const content = await zip.file(slideFile)?.async('string');
      if (content) {
        text += `\n\n--- Slide ---\n`;
        const textMatches = content.match(/<a:t[^>]*>([^<]+)<\/a:t>/g);
        if (textMatches) {
          textMatches.forEach((match) => {
            const textContent = match.replace(/<\/?a:t[^>]*>/g, '');
            text += textContent + ' ';
          });
        }
      }

      // Update progress based on slides processed
      if (onProgress && totalSlides > 0) {
        const progress = 0.4 + (0.6 * (i + 1)) / totalSlides;
        onProgress(Math.min(progress, 0.95));
      }
    }

    if (onProgress) onProgress(1);
    return text.trim();
  } catch (error) {
    console.error('[Worker] PPTX extraction error:', error);
    return '';
  }
}

// PDF text extraction
async function extractPdfText(
  file: File,
  fileIndex: number,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await import('pdfjs-dist');

    const workerUrl = '/lib/pdfjs/pdf.worker.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let text = '';
    const maxPages = PROCESSING_LIMITS.PDF_MAX_PAGES;
    const pagesToProcess = Math.min(pdf.numPages, maxPages);

    for (let i = 1; i <= pagesToProcess; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .map((item: unknown) => (item as { str: string }).str)
        .filter((str: string) => str.trim())
        .join(' ');

      text += `\n\n--- Page ${i} ---\n${pageText}`;

      // Emit progress after each page
      if (onProgress) {
        const progress = i / pagesToProcess;
        onProgress(progress);
      }
    }

    if (pdf.numPages > maxPages) {
      text += `\n\n... (${pdf.numPages - maxPages} more pages not extracted)`;
    }

    await pdf.destroy();
    return text.trim();
  } catch (error) {
    console.error('[Worker] PDF extraction error:', error);
    return '';
  }
}

function getFileType(file: File): 'image' | 'pdf' | 'code' | 'text' | 'office' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('text/')) return 'text';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext && CODE_EXTENSIONS.includes(ext)) return 'code';
  if (ext && OFFICE_EXTENSIONS.includes(ext)) return 'office';
  return 'text';
}

async function processFile(
  file: File,
  dataUrl: string,
  fileIndex: number,
  onProgress?: (progress: number) => void
): Promise<MessageFile> {
  const fileType = getFileType(file);
  let extractedText: string | undefined;

  if (onProgress) onProgress(0.1);

  if (fileType === 'office') {
    const ext = file.name.split('.').pop()?.toLowerCase();

    try {
      if (ext === 'docx') {
        extractedText = await extractDocxText(file, onProgress);
      } else if (ext === 'pptx') {
        extractedText = await extractPptxText(file, onProgress);
      } else if (['xlsx', 'xls', 'xlsm', 'xlsb', 'csv', 'ods'].includes(ext || '')) {
        extractedText = await extractXlsxText(file, onProgress);
      }
    } catch (error) {
      console.error('[Worker] Failed to extract text from Office document:', error);
    }
  } else if (fileType === 'pdf') {
    try {
      extractedText = await extractPdfText(file, fileIndex, onProgress);
    } catch (error) {
      console.error('[Worker] Failed to extract text from PDF:', error);
    }
  }

  if (onProgress) onProgress(1);

  return {
    url: dataUrl,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    extractedText,
  };
}

// Handle messages from main thread
self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const { type } = event.data;

  try {
    if (type === 'processFile') {
      const { file, dataUrl } = event.data;
      const onProgress = (progress: number) => {
        self.postMessage({
          type: 'progress',
          fileIndex: 0,
          fileName: file.name,
          progress,
        } as ProgressMessage);
      };
      const result = await processFile(file, dataUrl, 0, onProgress);
      self.postMessage({ type: 'complete', data: result });
    } else if (type === 'processFiles') {
      const { files } = event.data;
      const results: MessageFile[] = [];

      // Process files sequentially to track progress for each
      for (let i = 0; i < files.length; i++) {
        const { file, dataUrl } = files[i];
        const onProgress = (progress: number) => {
          self.postMessage({
            type: 'progress',
            fileIndex: i,
            fileName: file.name,
            progress,
          } as ProgressMessage);
        };
        const result = await processFile(file, dataUrl, i, onProgress);
        results.push(result);
      }

      self.postMessage({ type: 'complete', data: results });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export {};
