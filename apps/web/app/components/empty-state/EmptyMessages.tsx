import { MessageCircle, Sparkles } from 'lucide-react';
import { useTranslation } from '~/i18n';

interface EmptyMessagesProps {
  className?: string;
}

/**
 * EmptyMessages component - displayed when the current conversation has no messages.
 * Shows a welcome message with icons to encourage the user to start chatting.
 */
export function EmptyMessages({ className = '' }: EmptyMessagesProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-6 text-muted-foreground fade-in ${className}`}
    >
      {/* Icon container with gradient background */}
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent rounded-full blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20">
          <MessageCircle className="h-10 w-10 text-primary" strokeWidth={1.5} />
        </div>
        {/* Decorative sparkle */}
        <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-primary/60" />
      </div>

      {/* Welcome text */}
      <h2 className="mb-3 text-center text-2xl font-semibold text-foreground sm:text-3xl">
        {t('chat.empty.welcome')}
      </h2>
      <p className="max-w-md text-center text-sm leading-relaxed sm:text-base">
        {t('chat.empty.getStarted')}
      </p>

      {/* Quick hint cards */}
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3 transition-smooth hover:bg-muted/50">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm">{t('chat.empty.features.chat')}</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3 transition-smooth hover:bg-muted/50">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <MessageCircle className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm">{t('chat.empty.getStarted')}</span>
        </div>
      </div>
    </div>
  );
}
