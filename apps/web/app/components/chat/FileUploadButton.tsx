import { useRef, useEffect } from 'react';
import { Paperclip, FileText } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { ACCEPTED_FILE_TYPES } from '~/lib/fileUtils';

interface FileUploadButtonProps {
  onFileSelect: (files: File[]) => void;
  disabled?: boolean;
  isDragging?: boolean;
  accept?: string;
  className?: string;
}

export function FileUploadButton({
  onFileSelect,
  disabled = false,
  isDragging = false,
  accept = ACCEPTED_FILE_TYPES,
  className = 'h-11 w-11 rounded-xl',
}: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    onFileSelect(Array.from(selectedFiles));
    e.target.value = '';
  };

  // Expose click handler via ref
  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click = () => {
        fileInputRef.current?.showPicker();
      };
    }
  }, []);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        title="Attach files (images, PDFs, Office docs, spreadsheets, code, text)"
      >
        <div className="flex items-center justify-center">
          <Paperclip className="h-5 w-5" />
        </div>
      </Button>

      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 text-primary">
            <FileText className="h-8 w-8" />
            <span className="font-medium">
              Drop files here (images, PDFs, Office docs, spreadsheets, code, text)
            </span>
          </div>
        </div>
      )}
    </>
  );
}
