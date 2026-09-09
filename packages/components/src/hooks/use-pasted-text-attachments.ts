import type { AttachmentProgress } from '@/components/chat/submission/pending-attachment-submission';
import { useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { usePlatformCapability } from '@lody/platform/react';
import { SESSION_FILE_MAX_COUNT } from '@lody/shared';
import type { MachineId, SessionId, SessionInputBlock, WorkspaceId } from '@lody/shared';
import { localMachineIdAtom } from '@/atoms/local-probe';
import { authTokenAtom } from '@/atoms/runtime';
import {
  sendSessionFileToLocalRuntime,
  canUseElectronLocalFileSend,
} from '@/lib/electron-session-file-sender';
import {
  computeSha256Hex,
  uploadSessionFile,
  validateSessionFile,
} from '@/lib/session-file-upload';
import { getPastedTextFileName, type PastedTextDraft } from '@/lib/pasted-text-draft';

/** Called inside the composer's submission lock, using its frozen draft and destination. */
export function usePastedTextAttachments(
  workspaceId: WorkspaceId | null | undefined,
  machineId: MachineId | null | undefined
) {
  const localMachineId = useAtomValue(localMachineIdAtom);
  const token = useAtomValue(authTokenAtom);
  const cloudSync = usePlatformCapability('cloudSync');
  const { t } = useTranslation();
  return useCallback(
    async (
      drafts: readonly PastedTextDraft[],
      sessionId: SessionId,
      existingBlocks: readonly SessionInputBlock[] = [],
      options?: { signal?: AbortSignal; onProgress?: (progress: AttachmentProgress) => void }
    ): Promise<SessionInputBlock[]> => {
      if (
        drafts.length + existingBlocks.filter((block) => block.type === 'file').length >
        SESSION_FILE_MAX_COUNT
      )
        throw new Error(
          t(
            'composer.tooManyTextAttachments',
            'Too many attachments. Remove a file or convert it to message text.'
          )
        );
      const blocks: SessionInputBlock[] = [];
      for (const [index, draft] of drafts.entries()) {
        options?.signal?.throwIfAborted();
        const file = new File([draft.text], getPastedTextFileName(draft), { type: 'text/plain' });
        const report = (
          progress: import('@/lib/session-file-upload').SessionFileTransferProgress
        ) =>
          options?.onProgress?.({ ...progress, fileName: file.name, index, count: drafts.length });
        report({ phase: 'preparing', percent: 0, loadedBytes: 0, totalBytes: file.size });
        if (!workspaceId || !machineId || validateSessionFile(file)) {
          throw new Error(
            t(
              'composer.pastedFileInvalid',
              'Text attachment is empty, too large, or its destination is unavailable.'
            )
          );
        }
        if (localMachineId === machineId && canUseElectronLocalFileSend()) {
          const result = await sendSessionFileToLocalRuntime({
            workspaceId,
            sessionId,
            machineId,
            file,
          });
          if (!result?.ok || !result.files[0])
            throw new Error(t('sessions.fileUploadFailed', 'File upload failed'));
          options?.signal?.throwIfAborted();
          report({
            phase: 'verifying',
            percent: 100,
            loadedBytes: file.size,
            totalBytes: file.size,
          });
          blocks.push(result.files[0]);
        } else {
          if (!cloudSync || !token)
            throw new Error(t('sessions.fileUploadMissingAuth', 'Please sign in to upload files'));
          const sha256 = await computeSha256Hex(file, {
            signal: options?.signal,
            onProgress: report,
          });
          const uploaded = await uploadSessionFile({
            workspaceId,
            sessionId,
            token,
            file,
            sha256,
            textPreview: true,
            signal: options?.signal,
            onProgress: report,
          });
          blocks.push(uploaded);
        }
      }
      return blocks;
    },
    [workspaceId, machineId, localMachineId, token, cloudSync, t]
  );
}
