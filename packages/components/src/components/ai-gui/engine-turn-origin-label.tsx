import { useTranslation } from 'react-i18next';

/** Only persisted, known engine origins receive public labels. */
export const EngineTurnOriginLabel = ({ origin }: { origin?: string }) => {
  const { t } = useTranslation();
  const label =
    origin === 'cron_job' ? t('Scheduled task') : origin === 'task' ? t('Background task') : null;
  return label ? <div className="pb-1 text-muted-foreground text-[0.9em]">{label}</div> : null;
};
