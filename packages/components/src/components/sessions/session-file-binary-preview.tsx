import { ExternalLink, FolderOpen } from 'lucide-react';
import { Button } from '@/ui/button';
import type { SessionFileLocalHostActions } from '@/lib/session-file-actions';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { getImageMimeTypeForPath } from '@/lib/image-file-preview';
import { SessionFileImagePreview } from './session-file-image-preview';

interface SessionFileBinaryPreviewProps {
  readonly path: string;
  readonly bytes?: Uint8Array;
  readonly url?: string;
  readonly localHost?: SessionFileLocalHostActions;
}

/**
 * Renders a binary Code Collab file. Image types (png/jpeg/gif/webp/…) are
 * previewed inline; everything else offers local system actions when available. Render-only: bytes are provided by the file-content snapshot.
 */
export const SessionFileBinaryPreview = memo(function SessionFileBinaryPreview({
  path,
  bytes,
  url,
  localHost,
}: SessionFileBinaryPreviewProps) {
  const { t } = useTranslation();

  if (getImageMimeTypeForPath(path) && (url || (bytes && bytes.byteLength > 0))) {
    return <SessionFileImagePreview path={path} bytes={bytes} url={url} />;
  }

  return (
    <div className="h-full space-y-2 p-3">
      <div className="text-sm font-medium text-foreground">
        {t('sessions.fileDiff.binary.title', 'Binary file')}
      </div>
      <div className="text-xs text-muted-foreground">
        {t('sessions.fileViewer.binary.message', 'This binary file cannot be previewed.')}
      </div>
      {localHost ? (
        <div className="flex flex-col items-start gap-1 pt-2">
          <Button size="sm" variant="secondary" onClick={localHost.onOpen}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {t('sessions.fileActions.openInDefaultApp', 'Open in default app')}
          </Button>
          <Button size="sm" variant="ghost" onClick={localHost.onReveal}>
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {localHost.revealLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
});
