import { X } from 'lucide-react';
import { cn } from '~/lib/utils';
import type { MessageFile } from '@chatwithme/shared';
import { getFileIcon, formatFileSize } from '~/lib/fileUtils';
import { UploadProgress } from './UploadProgress';

interface FilePreviewProps {
  file: MessageFile & { objectUrl?: string };
  onRemove: (index: number) => void;
  index: number;
  progress?: number; // 0-1 when processing, undefined when complete
}

export function FilePreview({ file, onRemove, index, progress }: FilePreviewProps) {
  const isProcessing = progress !== undefined && progress < 1;
  const showProgressOverlay = isProcessing;

  return (
    <div
      className={cn(
        'relative group rounded-lg border border-border p-2',
        file.mimeType.startsWith('image/')
          ? 'w-16 h-16 overflow-hidden p-0'
          : 'w-auto max-w-[200px]'
      )}
    >
      {file.mimeType.startsWith('image/') ? (
        <>
          <img src={file.url} alt={file.fileName} className="w-full h-full object-cover" />
          {/* Progress overlay for images */}
          {showProgressOverlay && (
            <UploadProgress progress={progress} fileName={file.fileName} fileSize={file.size} />
          )}
        </>
      ) : (
        <div className="flex items-center gap-2">
          {getFileIcon(file, 'h-6 w-6')}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate max-w-[120px]">{file.fileName}</p>
            <p className="text-[10px] text-muted-foreground">
              {isProcessing ? `${Math.round(progress * 100)}%` : formatFileSize(file.size)}
            </p>
          </div>
          {/* Progress overlay for non-images */}
          {showProgressOverlay && (
            <UploadProgress progress={progress} fileName={file.fileName} fileSize={file.size} />
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="absolute right-1 top-1 rounded-full bg-destructive h-7 w-7 flex items-center justify-center text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isProcessing}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
