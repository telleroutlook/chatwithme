import { cn } from '~/lib/utils';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import {
  Bot,
  User,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileImage,
} from 'lucide-react';
import { useState, memo, Suspense, lazy, useEffect, useRef } from 'react';
import { ErrorBoundary } from '~/components/error';
import type { Message, ImageAnalysis } from '@chatwithme/shared';
import { useTouchGesture } from '~/hooks/useTouchGesture';
import { getFileIcon, formatFileSize, isValidImageUrl } from '~/lib/fileUtils';

const LazyMarkdownRenderer = lazy(() =>
  import('./MarkdownRenderer').then((m) => ({ default: m.MarkdownRenderer }))
);

interface ChatBubbleProps {
  message: Message | { role: 'user' | 'assistant'; message: string };
  messageId?: string;
  isLast?: boolean;
  isLastUserMessage?: boolean;
  onRegenerate?: () => void;
  onQuickReply?: (question: string) => void;
  onLongPress?: (messageId: string, content: string, position: { x: number; y: number }) => void;
}

// Custom comparison function to avoid unnecessary re-renders
const arePropsEqual = (prevProps: ChatBubbleProps, nextProps: ChatBubbleProps): boolean => {
  return (
    prevProps.messageId === nextProps.messageId &&
    prevProps.message.message === nextProps.message.message &&
    prevProps.isLast === nextProps.isLast &&
    prevProps.isLastUserMessage === nextProps.isLastUserMessage
  );
};

export const ChatBubble = memo<ChatBubbleProps>(
  ({ message, messageId, isLast, isLastUserMessage, onRegenerate, onQuickReply, onLongPress }) => {
    const isUser = message.role === 'user';
    const suggestions = 'suggestions' in message ? message.suggestions : undefined;
    const [animateEntry, setAnimateEntry] = useState(true);
    const bubbleRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      setAnimateEntry(false);
    }, []);

    // Long press gesture for message actions menu
    useTouchGesture(bubbleRef, {
      onLongPress:
        onLongPress && messageId
          ? (e) => {
              const touch = e.touches[0] || e.changedTouches[0];
              onLongPress(messageId, message.message, { x: touch.clientX, y: touch.clientY });
            }
          : undefined,
      enabled: !!onLongPress && !!messageId,
    });

    return (
      <div
        ref={bubbleRef}
        data-message-id={messageId}
        className={cn(
          'flex min-w-0 gap-2 p-3 sm:gap-3 sm:p-4',
          isUser ? 'flex-row-reverse' : 'flex-row',
          animateEntry ? 'message-enter' : ''
        )}
      >
        <Avatar className="h-8 w-8 shrink-0 sm:h-9 sm:w-9">
          <AvatarFallback
            className={cn(isUser ? 'bg-primary text-primary-foreground' : 'bg-muted')}
          >
            {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>

        <div
          className={cn(
            'min-w-0 w-full max-w-[calc(100%-2.5rem)] rounded-xl px-3.5 py-3 text-[15px] leading-relaxed sm:max-w-[calc(100%-3rem)] sm:px-4',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'
          )}
        >
          {isUser ? (
            <>
              <p className="whitespace-pre-wrap break-words">{message.message}</p>
              {'files' in message && message.files && message.files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {message.files.map((file, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2 py-1',
                        'bg-primary-foreground/10 border border-primary-foreground/20'
                      )}
                    >
                      {file.mimeType.startsWith('image/') ? (
                        <>
                          {isValidImageUrl(file.url) ? (
                            <img
                              loading="lazy"
                              decoding="async"
                              src={file.url}
                              alt={file.fileName}
                              className="h-8 w-8 rounded object-cover"
                            />
                          ) : (
                            // Fallback if URL validation fails
                            <FileImage className="h-8 w-8 text-muted-foreground" />
                          )}
                          <span className="text-xs opacity-80 max-w-[100px] truncate">
                            {file.fileName}
                          </span>
                        </>
                      ) : (
                        <>
                          {getFileIcon(file)}
                          <div className="flex flex-col">
                            <span className="text-xs font-medium opacity-90 max-w-[120px] truncate">
                              {file.fileName}
                            </span>
                            <span className="text-[10px] opacity-70">
                              {formatFileSize(file.size)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <ErrorBoundary
              fallback={() => (
                <div className="text-destructive text-sm">Failed to render message</div>
              )}
            >
              <Suspense fallback={<div className="animate-pulse bg-muted rounded-lg h-20" />}>
                <LazyMarkdownRenderer content={message.message} />
              </Suspense>
            </ErrorBoundary>
          )}

          {!isUser &&
            'imageAnalyses' in message &&
            message.imageAnalyses &&
            message.imageAnalyses.length > 0 && (
              <ImageAnalysisCard analyses={message.imageAnalyses} />
            )}

          {!isUser && suggestions && suggestions.length > 0 && onQuickReply && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion}-${index}`}
                  onClick={() => onQuickReply(suggestion)}
                  className="rounded-full border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-foreground/90 transition-all hover:border-accent-foreground/80 hover:bg-accent hover:text-foreground active:scale-95"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-1">
            <CopyMessageButton text={message.message} isUser={isUser} />
            {((!isUser && isLast) || (isUser && isLastUserMessage)) && onRegenerate && (
              <button
                onClick={onRegenerate}
                className={cn(
                  'h-10 w-10 rounded-lg p-2 transition-colors',
                  isUser
                    ? 'text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground active:bg-primary-foreground/20'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80'
                )}
                title="Regenerate response"
                aria-label="Regenerate response"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  },
  arePropsEqual
);
ChatBubble.displayName = 'ChatBubble';

interface CopyMessageButtonProps {
  text: string;
  isUser?: boolean;
}

const CopyMessageButton = memo<CopyMessageButtonProps>(({ text, isUser = false }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'h-10 w-10 rounded-lg p-2 transition-colors',
        isUser
          ? 'text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground active:bg-primary-foreground/20'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80'
      )}
      title="Copy message to clipboard"
      aria-label={copied ? 'Copied to clipboard' : 'Copy message to clipboard'}
    >
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </button>
  );
});
CopyMessageButton.displayName = 'CopyMessageButton';

interface ImageAnalysisCardProps {
  analyses: ImageAnalysis[];
}

const ImageAnalysisCard = memo<ImageAnalysisCardProps>(({ analyses }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (analyses.length === 0) return null;

  return (
    <div className="mt-3 border border-border rounded-lg overflow-hidden bg-muted/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted/70 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileImage className="h-4 w-4" />
          <span>图片解析 {analyses.length > 1 ? `(${analyses.length})` : ''}</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="px-3 py-2 space-y-3 border-t border-border bg-background/50">
          {analyses.map((item, index) => (
            <div key={index} className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <FileImage className="h-3 w-3 text-muted-foreground" />
                <span>{item.fileName}</span>
              </div>
              <p className="text-sm text-muted-foreground pl-5 leading-relaxed">{item.analysis}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
ImageAnalysisCard.displayName = 'ImageAnalysisCard';
