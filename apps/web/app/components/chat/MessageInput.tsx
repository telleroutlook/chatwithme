import { useEffect, useState, useRef, useCallback } from 'react';
import { Send, Paperclip, X, Image as ImageIcon, FileText, FileCode, File } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import type { MessageFile } from '@chatwithme/shared';

// Import mammoth for DOCX extraction
// @ts-ignore - mammoth.browser.js doesn't have types
import mammoth from 'mammoth/mammoth.browser.js';

const CODE_EXTENSIONS = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'cs', 'rb', 'php', 'sh', 'json', 'yaml', 'yml', 'toml', 'md', 'txt', 'csv'];
// Office documents: Word, Excel, PowerPoint, OpenDocument formats
// All spreadsheet formats use the xlsx library for text extraction
const OFFICE_EXTENSIONS = ['pptx', 'xlsx', 'xls', 'xlsm', 'xlsb', 'docx', 'ods'];

const ACCEPTED_FILE_TYPES = [
  'image/*',
  '.pdf',
  ...CODE_EXTENSIONS.map(ext => `.${ext}`),
  ...OFFICE_EXTENSIONS.map(ext => `.${ext}`)
].join(',');

// DOCX text extraction using mammoth
async function extractDocxText(file: File): Promise<string> {
  console.log('[Office Extract] DOCX extraction started:', file.name, 'Size:', file.size);

  try {
    const arrayBuffer = await file.arrayBuffer();
    console.log('[Office Extract] ArrayBuffer size:', arrayBuffer.byteLength);

    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value;

    console.log('[Office Extract] DOCX extraction completed');
    console.log('[Office Extract] Extracted text length:', text.length);
    console.log('[Office Extract] Text preview (first 200 chars):', text.substring(0, 200));

    return text;
  } catch (error) {
    console.error('[Office Extract] DOCX extraction error:', error);
    return '';
  }
}

// XLSX text extraction using xlsx
async function extractXlsxText(file: File): Promise<string> {
  console.log('[Office Extract] XLSX extraction started:', file.name, 'Size:', file.size);

  try {
    const arrayBuffer = await file.arrayBuffer();
    // Use dynamic import for browser compatibility
    const xlsxModule = await import('xlsx');
    
    // Handle different module export patterns (CommonJS vs ESM)
    // Some environments wrap it in default, some have it twice (default.default)
    let XLSX: any;
    if (xlsxModule && typeof (xlsxModule as any).read === 'function') {
      XLSX = xlsxModule;
    } else if (xlsxModule.default && typeof (xlsxModule.default as any).read === 'function') {
      XLSX = xlsxModule.default;
    } else if (xlsxModule.default && (xlsxModule.default as any).default && typeof (xlsxModule.default as any).default.read === 'function') {
      XLSX = (xlsxModule.default as any).default;
    } else {
      XLSX = xlsxModule;
    }

    console.log('[Office Extract] XLSX module loaded, checking for read function...');
    if (!XLSX || typeof XLSX.read !== 'function') {
      console.error('[Office Extract] XLSX.read is not a function:', XLSX);
      throw new Error('XLSX library not loaded correctly');
    }

    const workbook = XLSX.read(arrayBuffer);

    console.log('[Office Extract] XLSX workbook loaded, sheets:', workbook.SheetNames);

    let text = '';

    (workbook.SheetNames as string[]).forEach((sheetName: string) => {
      const worksheet = workbook.Sheets[sheetName];
      if (!XLSX.utils || typeof XLSX.utils.sheet_to_json !== 'function') {
        console.error('[Office Extract] XLSX.utils.sheet_to_json not available');
        return;
      }
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
      text += `\n\n--- Sheet: ${sheetName} (${jsonData.length} rows) ---\n`;
      jsonData.forEach((row, index) => {
        if (index < 5) { // Log first 5 rows for debugging
          console.log(`[Office Extract] Row ${index}:`, row);
        }
        text += row.join('\t') + '\n';
      });
    });

    console.log('[Office Extract] XLSX extraction completed');
    console.log('[Office Extract] Extracted text length:', text.length);
    console.log('[Office Extract] Text preview (first 200 chars):', text.substring(0, 200));

    return text;
  } catch (error) {
    console.error('[Office Extract] XLSX extraction error:', error);
    return '';
  }
}

// PPTX text extraction using jszip
async function extractPptxText(file: File): Promise<string> {
  console.log('[Office Extract] PPTX extraction started:', file.name, 'Size:', file.size);

  try {
    const arrayBuffer = await file.arrayBuffer();
    // Use dynamic import for browser compatibility
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(arrayBuffer);

    console.log('[Office Extract] PPTX zip loaded, files:', Object.keys(zip.files).length);

    let text = '';
    let slideCount = 0;

    // Extract slide content
    const slideFiles = Object.keys(zip.files).filter(name =>
      name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
    );

    console.log('[Office Extract] Found slides:', slideFiles.length, slideFiles);

    for (const slideFile of slideFiles.sort()) {
      const content = await zip.file(slideFile)?.async('string');
      if (content) {
        slideCount++;
        text += `\n\n--- Slide ---\n`;
        // Extract text content (simplified version, extracts <a:t> tag content)
        const textMatches = content.match(/<a:t[^>]*>([^<]+)<\/a:t>/g);
        if (textMatches) {
          console.log(`[Office Extract] Slide ${slideCount}: found ${textMatches.length} text matches`);
          textMatches.forEach(match => {
            const textContent = match.replace(/<\/?a:t[^>]*>/g, '');
            text += textContent + ' ';
          });
        }
      }
    }

    console.log('[Office Extract] PPTX extraction completed');
    console.log('[Office Extract] Processed slides:', slideCount);
    console.log('[Office Extract] Extracted text length:', text.length);
    console.log('[Office Extract] Text preview (first 200 chars):', text.substring(0, 200));

    return text.trim();
  } catch (error) {
    console.error('[Office Extract] PPTX extraction error:', error);
    return '';
  }
}

interface MessageInputProps {
  onSend: (message: string, files?: MessageFile[]) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export function MessageInput({
  onSend,
  disabled,
  placeholder = 'Type a message...',
  autoFocus = false,
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<MessageFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, disabled]);

  const handleSubmit = useCallback(() => {
    if (disabled) return;
    if (!message.trim() && files.length === 0) return;

    onSend(message.trim(), files.length > 0 ? files : undefined);
    setMessage('');
    setFiles([]);
  }, [message, files, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleMessageChange = (value: string) => {
    setMessage(value);
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    // Use smaller max-height on mobile for virtual keyboard compatibility
    const maxHeight = window.innerWidth < 640 ? 120 : 128;
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    await processFiles(Array.from(selectedFiles));
    e.target.value = '';
  };

  const getFileType = (file: File): 'image' | 'pdf' | 'code' | 'text' | 'office' => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type.startsWith('text/')) return 'text';
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext && CODE_EXTENSIONS.includes(ext)) return 'code';
    if (ext && OFFICE_EXTENSIONS.includes(ext)) return 'office';
    return 'text';
  };

  const processFiles = async (fileList: File[]) => {
    const validFiles = fileList.filter((file) => {
      const fileType = getFileType(file);
      if (fileType !== 'image' && fileType !== 'pdf' && fileType !== 'code' && fileType !== 'text' && fileType !== 'office') return false;
      if (file.size > 10 * 1024 * 1024) return false;
      return true;
    });
    if (validFiles.length === 0) return;

    const converted = await Promise.all(
      validFiles.map(
        async (file): Promise<MessageFile> => {
          const fileType = getFileType(file);

          // For Office documents, extract text content
          let extractedText: string | undefined;
          if (fileType === 'office') {
            const ext = file.name.split('.').pop()?.toLowerCase();

            try {
              // Word documents
              if (ext === 'docx') {
                extractedText = await extractDocxText(file);
              }
              // PowerPoint presentations
              else if (ext === 'pptx') {
                extractedText = await extractPptxText(file);
              }
              // Spreadsheet formats (xlsx, xls, xlsm, xlsb, csv, ods) - all use xlsx library
              else if (['xlsx', 'xls', 'xlsm', 'xlsb', 'csv', 'ods'].includes(ext || '')) {
                extractedText = await extractXlsxText(file);
              }
            } catch (error) {
              console.error('Failed to extract text from Office document:', error);
            }
          }

          // Convert file to data URL
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
            reader.readAsDataURL(file);
          });

          return {
            url: dataUrl,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            extractedText,
          };
        }
      )
    );

    setFiles((prev) => [...prev, ...converted]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: MessageFile) => {
    if (file.mimeType.startsWith('image/')) return null;
    if (file.mimeType === 'application/pdf') return <FileText className="h-6 w-6 text-red-500" />;
    const ext = file.fileName.split('.').pop()?.toLowerCase();
    if (ext && CODE_EXTENSIONS.includes(ext)) return <FileCode className="h-6 w-6 text-blue-500" />;
    if (ext && OFFICE_EXTENSIONS.includes(ext)) {
      // Word documents - blue
      if (ext === 'docx') return <FileText className="h-6 w-6 text-blue-500" />;
      // PowerPoint - orange
      if (ext === 'pptx') return <FileText className="h-6 w-6 text-orange-500" />;
      // Excel spreadsheets - green
      if (['xlsx', 'xls', 'xlsm', 'xlsb', 'csv', 'ods'].includes(ext)) {
        return <FileText className="h-6 w-6 text-green-500" />;
      }
      return <FileText className="h-6 w-6 text-blue-500" />;
    }
    return <File className="h-6 w-6 text-gray-500" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={cn(
        'safe-area-bottom relative border-t border-border bg-card/95 px-3 pb-3 pt-2.5 transition-colors backdrop-blur-lg sm:px-4 sm:pb-4 sm:pt-3',
        isDragging && 'bg-primary/10'
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* File previews */}
      {files.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div
              key={index}
              className={cn(
                "relative group rounded-lg border border-border p-2",
                file.mimeType.startsWith('image/') ? "w-16 h-16 overflow-hidden p-0" : "w-auto max-w-[200px]"
              )}
            >
              {file.mimeType.startsWith('image/') ? (
                <img
                  src={file.url}
                  alt={file.fileName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center gap-2">
                  {getFileIcon(file)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate max-w-[120px]">{file.fileName}</p>
                    <p className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-xl"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Attach files (images, PDFs, Office docs, spreadsheets, code, text)"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => handleMessageChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            rows={1}
            className={cn(
              'w-full resize-none rounded-xl border border-input bg-background px-4 py-3.5 text-[15px] pr-12',
              'focus:outline-none focus:ring-1 focus:ring-ring',
              'placeholder:text-muted-foreground',
              'overflow-y-auto'
            )}
            style={{ minHeight: '52px', maxHeight: 'min(120px, 30vh)' }}
          />
        </div>

        <Button
          type="button"
          size="icon"
          className="h-11 w-11 rounded-xl"
          onClick={handleSubmit}
          disabled={disabled || (!message.trim() && files.length === 0)}
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>

      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 text-primary">
            <FileText className="h-8 w-8" />
            <span className="font-medium">Drop files here (images, PDFs, Office docs, spreadsheets, code, text)</span>
          </div>
        </div>
      )}
    </div>
  );
}
