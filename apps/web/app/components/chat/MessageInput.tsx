import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { Send } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/i18n';
import type { MessageFile } from '@chatwithme/shared';
import { getFileType } from '~/lib/fileUtils';
import { FILE_SIZE_LIMITS } from '~/lib/constants';
import { FilePreview } from './FilePreview';
import { FileUploadButton } from './FileUploadButton';
import { TextInput } from './TextInput';
import { useFileProcessor } from '~/hooks/useFileProcessor';

interface FileWithProgress extends MessageFile {
  objectUrl?: string;
  progress?: number; // 0-1 when processing, undefined when complete
}

interface MessageInputProps {
  onSend: (message: string, files?: MessageFile[]) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export const MessageInput = memo(function MessageInput({
  onSend,
  disabled,
  placeholder,
  autoFocus = false,
}: MessageInputProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const { processFiles: processFilesWithWorker, isProcessing } = useFileProcessor();

  // Mobile keyboard adaptation
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return;

    const handleResize = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--visual-viewport-height', `${vh}px`);

      // Auto-scroll to input when keyboard appears
      textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, []);

  // Cleanup object URLs when component unmounts
  useEffect(() => {
    const currentUrls = objectUrlsRef.current;
    return () => {
      currentUrls.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      currentUrls.clear();
    };
  }, []);

  const handleSubmit = useCallback(() => {
    if (disabled) return;
    if (!message.trim() && files.length === 0) return;

    // Only allow sending if no files are currently being processed
    const hasProcessingFiles = files.some((f) => f.progress !== undefined && f.progress < 1);
    if (hasProcessingFiles) return;

    // Clean up object URLs before sending
    files.forEach((file) => {
      if (file.objectUrl && file.objectUrl.startsWith('blob:')) {
        objectUrlsRef.current.delete(file.objectUrl);
        URL.revokeObjectURL(file.objectUrl);
      }
    });

    // Send files without objectUrl and progress properties
    const cleanFiles: MessageFile[] = files.map(
      ({ objectUrl: _objectUrl, progress: _progress, ...rest }) => rest
    );
    onSend(message.trim(), cleanFiles.length > 0 ? cleanFiles : undefined);
    setMessage('');
    setFiles([]);
  }, [message, files, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const processFiles = async (fileList: File[]) => {
    const validFiles = fileList.filter((file) => {
      const fileType = getFileType(file);
      if (
        fileType !== 'image' &&
        fileType !== 'pdf' &&
        fileType !== 'code' &&
        fileType !== 'text' &&
        fileType !== 'office'
      )
        return false;
      if (file.size > FILE_SIZE_LIMITS.IMAGE) return false;
      return true;
    });
    if (validFiles.length === 0) return;

    // Convert files to data URLs
    const filesWithDataUrls = await Promise.all(
      validFiles.map(async (file) => ({
        file,
        dataUrl: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
          reader.readAsDataURL(file);
        }),
      }))
    );

    // Create placeholder files with initial progress
    const placeholderFiles: FileWithProgress[] = filesWithDataUrls.map(({ file, dataUrl }) => {
      const fileType = getFileType(file);
      let fileUrl: string;
      let objectUrl: string | undefined;

      if (fileType === 'image') {
        fileUrl = URL.createObjectURL(file);
        objectUrl = fileUrl;
        objectUrlsRef.current.add(fileUrl);
      } else {
        fileUrl = dataUrl;
      }

      return {
        url: fileUrl,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        objectUrl,
        progress: 0, // Start with 0 progress
      };
    });

    // Add placeholder files to state
    const startIndex = files.length;
    setFiles((prev) => [...prev, ...placeholderFiles]);

    // Process files using the worker hook
    try {
      const processedFiles = await processFilesWithWorker(filesWithDataUrls, {
        onProgress: (fileIndex, fileName, progress) => {
          setFiles((prev) => {
            const newFiles = [...prev];
            const actualIndex = startIndex + fileIndex;
            if (newFiles[actualIndex]) {
              newFiles[actualIndex] = { ...newFiles[actualIndex], progress };
            }
            return newFiles;
          });
        },
        onOverallProgress: (_progress) => {
          // Optional: could use for a global progress indicator
        },
      });

      // Update files with processed results (with extracted text)
      setFiles((prev) => {
        const newFiles = [...prev];
        processedFiles.forEach((processedFile, i) => {
          const actualIndex = startIndex + i;
          const existingFile = newFiles[actualIndex];
          newFiles[actualIndex] = {
            ...processedFile,
            objectUrl: existingFile?.objectUrl,
            progress: 1, // Complete
          };
        });
        return newFiles;
      });
    } catch (error) {
      console.error('File processing failed:', error);
      // Remove placeholder files on error
      setFiles((prev) => prev.slice(0, startIndex));
    }
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
    const fileToRemove = files[index];
    // Don't allow removal while processing
    if (fileToRemove.progress !== undefined && fileToRemove.progress < 1) {
      return;
    }

    setFiles((prev) => {
      // Revoke object URL if it exists
      if (fileToRemove.objectUrl && fileToRemove.objectUrl.startsWith('blob:')) {
        objectUrlsRef.current.delete(fileToRemove.objectUrl);
        URL.revokeObjectURL(fileToRemove.objectUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const hasProcessingFiles = files.some((f) => f.progress !== undefined && f.progress < 1);

  return (
    <div
      className={cn(
        'safe-area-bottom relative border-t border-border bg-card/95 px-2 pb-3 pt-2.5 transition-colors backdrop-blur-lg sm:px-4 sm:pb-4 sm:pt-3',
        isDragging && 'bg-primary/10'
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{
        // Use visual viewport for mobile to adapt to keyboard
        maxHeight:
          typeof window !== 'undefined' && window.innerWidth < 768
            ? 'var(--visual-viewport-height, 100vh)'
            : undefined,
      }}
    >
      {/* File previews */}
      {files.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <FilePreview
              key={index}
              file={file}
              index={index}
              onRemove={removeFile}
              progress={file.progress}
            />
          ))}
        </div>
      )}

      {/* Mobile button row */}
      <div className="flex items-center justify-between gap-2 sm:hidden mb-2 input-action-row">
        <FileUploadButton
          onFileSelect={processFiles}
          disabled={disabled || isProcessing}
          isDragging={isDragging}
          className="h-10 w-10 rounded-lg"
        />
        <Button
          type="button"
          size="icon"
          className="h-10 w-10 rounded-lg"
          onClick={handleSubmit}
          disabled={disabled || (!message.trim() && files.length === 0) || hasProcessingFiles}
          aria-label={t('chat.input.send')}
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>

      {/* Desktop row: FileUpload + TextInput + Send button */}
      <div className="flex items-end gap-2">
        <FileUploadButton
          onFileSelect={processFiles}
          disabled={disabled || isProcessing}
          isDragging={isDragging}
          className="hidden sm:block h-11 w-11 rounded-xl"
        />

        <TextInput
          value={message}
          onChange={setMessage}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder || t('chat.input.placeholder')}
          autoFocus={autoFocus}
          textareaRef={textareaRef}
        />

        <Button
          type="button"
          size="icon"
          className="hidden sm:block h-11 w-11 rounded-xl"
          onClick={handleSubmit}
          disabled={disabled || (!message.trim() && files.length === 0) || hasProcessingFiles}
          aria-label={t('chat.input.send')}
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
});
