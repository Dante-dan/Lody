import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import type {
  AttachmentProgress,
  PendingAttachmentSubmission,
} from './pending-attachment-submission';

export function AttachmentSubmissionStatus({
  text,
  progress,
  phase,
  onRetry,
  onEdit,
}: {
  text?: string;
  progress?: AttachmentProgress;
  phase: PendingAttachmentSubmission['phase'];
  onRetry?: () => void;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const failed = phase === 'upload-failed' || phase === 'submit-failed';
  return (
    <section
      className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-muted/20 p-4"
      aria-label={t('composer.unsentMessage', 'Message not sent')}
    >
      {text ? (
        <p className="mb-3 max-h-40 overflow-auto whitespace-pre-wrap break-words text-sm">
          {text}
        </p>
      ) : null}
      <p role="status" className="text-sm font-medium">
        {failed
          ? t('composer.uploadSendFailed', 'Could not send. Your message has not been sent.')
          : phase === 'submitting'
            ? t('composer.uploadSendSubmitting', 'Files ready. Submitting message…')
            : t(
                'composer.uploadSendPending',
                'Uploading files. Your message has not been sent yet.'
              )}
      </p>
      {progress ? (
        <div className="mt-2 space-y-1">
          <p className="break-all text-xs text-muted-foreground">
            {progress.index + 1}/{progress.count} · {progress.fileName}
          </p>
          <p className="text-xs text-muted-foreground">
            {progress.phase === 'preparing'
              ? t('composer.uploadPreparing', 'Preparing file…')
              : progress.phase === 'verifying'
                ? t('composer.uploadVerifying', 'Verifying file…')
                : `${progress.percent}%`}
          </p>
          <progress
            className="h-2 w-full"
            max={100}
            value={progress.percent}
            aria-label={t('composer.fileUploadProgress', 'File upload progress')}
          />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {phase === 'upload-failed' && onRetry ? (
          <Button size="sm" onClick={onRetry}>
            {t('composer.retryFileSend', 'Retry upload')}
          </Button>
        ) : null}
        {phase !== 'submitting' && onEdit ? (
          <Button size="sm" variant="outline" onClick={onEdit}>
            {t('composer.returnToEdit', 'Return to edit')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
