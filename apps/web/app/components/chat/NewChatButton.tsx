import { Plus } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/i18n';

interface NewChatButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function NewChatButton({ onClick, disabled = false, className = '' }: NewChatButtonProps) {
  const { t } = useTranslation();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full rounded-xl gap-2 text-sm font-medium',
        'hover:border-primary/50 hover:bg-primary/5',
        'active:scale-[0.98]',
        className
      )}
    >
      <Plus className="h-4 w-4" />
      <span>{t('chat.sidebar.newChat')}</span>
    </Button>
  );
}
