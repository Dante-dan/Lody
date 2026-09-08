import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';

export function DeferredOperationResults({
  count,
  included,
  onIncludedChange,
  onProcess,
  disabled,
}: {
  count: number;
  included: boolean;
  onIncludedChange: (included: boolean) => void;
  onProcess: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 text-xs text-muted-foreground">
      <label className="flex min-w-0 items-center gap-2">
        <Checkbox
          checked={included}
          onCheckedChange={(value) => onIncludedChange(value === true)}
        />
        <span>{t('sessions.deferredOperations.include', { count })}</span>
      </label>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={onProcess}>
        {t('sessions.deferredOperations.process')}
      </Button>
    </div>
  );
}
