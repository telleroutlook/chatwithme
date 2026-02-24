import { useEffect, useState, useRef, useCallback } from 'react';
import { Send, Paperclip, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import type { MessageFile } from '@chatwithme/shared';

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

  const processFiles = async (fileList: File[]) => {
    const validFiles = fileList.filter((file) => {
      if (!file.type.startsWith('image/')) return false;
      if (file.size > 10 * 1024 * 1024) return false;
      return true;
    });
    if (validFiles.length === 0) return;

    const converted = await Promise.all(
      validFiles.map(
        (file) =>
          new Promise<MessageFile>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                url: String(reader.result),
                fileName: file.name,
                mimeType: file.type,
                size: file.size,
              });
            };
            reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
            reader.readAsDataURL(file);
          })
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
              className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border"
            >
              <img
                src={file.url}
                alt={file.fileName}
                className="w-full h-full object-cover"
              />
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
          accept="image/*"
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
          title="Attach image"
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
            <ImageIcon className="h-8 w-8" />
            <span className="font-medium">Drop images here</span>
          </div>
        </div>
      )}
    </div>
  );
}
