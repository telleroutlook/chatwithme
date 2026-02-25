import { useEffect, useRef } from 'react';
import { cn } from '~/lib/utils';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function TextInput({
  value,
  onChange,
  onKeyDown,
  disabled = false,
  placeholder = 'Type a message...',
  autoFocus = false,
  textareaRef,
}: TextInputProps) {
  // Auto-focus on mount
  useEffect(() => {
    if (!autoFocus || disabled) return;
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, disabled, textareaRef]);

  // Auto-scroll on focus for mobile keyboard
  useEffect(() => {
    const handleFocus = () => {
      // Only on mobile
      if (typeof window === 'undefined' || window.innerWidth >= 768) return;

      // Wait for keyboard animation before scrolling
      setTimeout(() => {
        textareaRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 300); // Wait for keyboard animation
    };

    const textarea = textareaRef.current;
    textarea?.addEventListener('focus', handleFocus);
    return () => textarea?.removeEventListener('focus', handleFocus);
  }, [textareaRef]);

  // Calculate max-height based on viewport for mobile
  const getMaxHeight = () => {
    if (typeof window === 'undefined') return 'min(120px, 30vh)';

    const isMobile = window.innerWidth < 640;
    if (isMobile) {
      // Use visual viewport height on mobile to prevent being hidden by keyboard
      return `min(120px, calc(var(--visual-viewport-height, 100vh) * 0.2))`;
    }
    return 'min(120px, 30vh)';
  };

  const handleMessageChange = (newValue: string) => {
    onChange(newValue);
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    // Use smaller max-height on mobile for virtual keyboard compatibility
    const maxHeight = window.innerWidth < 640 ? 120 : 128;
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`;
  };

  return (
    <div className="relative flex-1">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => handleMessageChange(e.target.value)}
        onKeyDown={onKeyDown}
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
        style={{ minHeight: '52px', maxHeight: getMaxHeight() }}
      />
    </div>
  );
}
