import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionShareManagement, SessionShareManagementEntry } from '@lody/cloud-api';
import { SESSION_SHARE_MAX_TARGETS } from '@lody/shared/session-sharing';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/ui/alert-dialog';

export type ShareCandidate = { sessionId: string; title: string };
export type SessionShareManagerProps = {
  sessionId: string;
  state: SessionShareManagement | undefined;
  candidates: ShareCandidate[];
  selected: string[];
  copyableShareIds: string[];
  now: number;
  busy: boolean;
  conflict: boolean;
  error: string | null;
  notice: string | null;
  onSelect: (ids: string[]) => void;
  onReload: () => void;
  onCreate: () => void;
  onSave: () => void;
  onReset: () => void;
  onCopy: (entry: SessionShareManagementEntry) => void;
  onRevoke: (entry: SessionShareManagementEntry) => void;
};

/** Controlled, responsive management UI shared by Web, Electron and Mobile. */
export function SessionShareManager(props: SessionShareManagerProps) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState<
    | { kind: 'reset'; version: string }
    | { kind: 'revoke'; entry: SessionShareManagementEntry }
    | null
  >(null);
  const { state, selected, busy, now } = props;
  const root = state?.root;
  const rootVersion = root
    ? `${root.shareId}:${root.scopeVersion}:${root.credentialVersion}`
    : 'new';
  const canManage = !root || root.canManage;
  const rootLive = root?.status === 'active' && (root.validUntil ?? 0) > now;
  const hasSecret = !!root && props.copyableShareIds.includes(root.shareId);
  const eligible = (id: string) =>
    state?.candidates.some(
      (entry) => entry.sessionId === id && entry.available && (entry.validUntil ?? 0) > now
    ) ?? false;
  const qualified = selected.every(eligible) && selected.includes(props.sessionId);
  const changed =
    !!root &&
    (selected.length !== root.sessionIds.length ||
      selected.some((id, index) => id !== root.sessionIds[index]));
  const mutationDisabled = busy || props.conflict || !acknowledged || !qualified;
  const candidateMap = new Map(props.candidates.map((entry) => [entry.sessionId, entry]));
  // Keep previously selected targets visible even after local discovery loses them.
  const candidateIds = [...new Set([props.sessionId, ...selected, ...candidateMap.keys()])];
  const title = (id: string) =>
    (state?.candidates.find((entry) => entry.sessionId === id)?.title ?? '') ||
    (candidateMap.get(id)?.title ?? '') ||
    t('sharing.manager.unknownTarget', 'Unavailable conversation');
  const others = state?.sources.filter((entry) => entry.rootSessionId !== props.sessionId) ?? [];

  return (
    <div className="space-y-4 text-sm" aria-busy={busy}>
      <p className="leading-5 text-muted-foreground">
        {t(
          'sharing.manager.disclosure',
          'Anyone with the full link can read and forward this conversation, including its original document, history, attachments and future updates. This is not end-to-end encrypted.'
        )}
      </p>
      {!state ? (
        <p role="status">{t('sharing.manager.loading', 'Loading sharing settings…')}</p>
      ) : (
        <>
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="font-medium">
              {rootLive
                ? t('sharing.manager.active', 'Link is active')
                : root?.status === 'revoked'
                  ? t('sharing.manager.revoked', 'Link revoked')
                  : root
                    ? t('sharing.manager.unavailable', 'Link is currently unavailable')
                    : t('sharing.manager.noLink', 'No independent share link')}
            </p>
            {root?.status === 'active' && root.canManage && !hasSecret && (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(
                  'sharing.manager.missingSecret',
                  'This device does not have the link secret. Reset the link to copy it here; the old link will stop working.'
                )}
              </p>
            )}
            {root && (
              <div className="mt-2 flex flex-wrap gap-2">
                {rootLive && hasSecret && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => props.onCopy(root)}
                  >
                    {t('sharing.manager.copy', 'Copy share link')}
                  </Button>
                )}
                {root.canRevoke && root.status === 'active' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setConfirmation({ kind: 'revoke', entry: root })}
                  >
                    {t('sharing.manager.revoke', 'Revoke link')}
                  </Button>
                )}
              </div>
            )}
          </div>
          {canManage && (
            <>
              <fieldset disabled={busy || props.conflict} className="space-y-2">
                <legend className="mb-2 font-medium">
                  {t('sharing.manager.scope', 'Conversations in this link')}
                </legend>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t(
                    'sharing.manager.explicit',
                    'Select each child tab or related conversation explicitly. New conversations are never added automatically.'
                  )}
                </p>
                <div className="max-h-56 space-y-1 overflow-y-auto overscroll-contain">
                  {candidateIds.map((id) => {
                    const checked = selected.includes(id);
                    const available = eligible(id);
                    return (
                      <label
                        key={id}
                        className="flex cursor-pointer items-start gap-2.5 rounded px-1 py-2"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={checked}
                          disabled={
                            busy ||
                            props.conflict ||
                            id === props.sessionId ||
                            (!checked &&
                              (!available || selected.length >= SESSION_SHARE_MAX_TARGETS))
                          }
                          onCheckedChange={(value) =>
                            props.onSelect(
                              value === true
                                ? [...selected, id]
                                : selected.filter((target) => target !== id)
                            )
                          }
                        />
                        <span className="min-w-0 break-words">
                          {title(id)}
                          {!available && (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {t(
                                'sharing.manager.notVerified',
                                'Not ready to share. Cloud sync and author verification are required.'
                              )}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('sharing.manager.limit', '{{count}} / {{max}} conversations selected', {
                    count: selected.length,
                    max: SESSION_SHARE_MAX_TARGETS,
                  })}
                </p>
              </fieldset>
              <label className="flex cursor-pointer items-start gap-2.5">
                <Checkbox
                  className="mt-0.5"
                  checked={acknowledged}
                  disabled={busy}
                  onCheckedChange={(value) => setAcknowledged(value === true)}
                />
                <span className="text-xs leading-5">
                  {t(
                    'sharing.manager.acknowledge',
                    'I understand that the complete selected conversations and future updates will be available to anyone with the link. Local-only and encrypted conversations cannot be shared.'
                  )}
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {!root ? (
                  <Button disabled={mutationDisabled} onClick={props.onCreate}>
                    {t('sharing.manager.create', 'Create share link')}
                  </Button>
                ) : (
                  <>
                    {root.status === 'active' && (
                      <Button
                        disabled={mutationDisabled || !changed || !rootLive || !hasSecret}
                        onClick={props.onSave}
                      >
                        {t('sharing.manager.save', 'Save selection')}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      disabled={mutationDisabled}
                      onClick={() => setConfirmation({ kind: 'reset', version: rootVersion })}
                    >
                      {t('sharing.manager.reset', 'Reset link')}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
          {others.length > 0 && (
            <section className="space-y-2 border-t border-border pt-3">
              <h3 className="font-medium">
                {t('sharing.manager.otherSources', 'Other links containing this conversation')}
              </h3>
              <p className="text-xs leading-5 text-muted-foreground">
                {t(
                  'sharing.manager.independent',
                  'Each link is independent. Revoking one does not revoke the others.'
                )}
              </p>
              {others.map((entry) => (
                <div key={entry.shareId} className="flex items-center justify-between gap-3 py-1">
                  <span className="min-w-0 break-words">
                    {(entry.title ?? '') || title(entry.rootSessionId)}
                    <span className="block text-xs text-muted-foreground">
                      {entry.status === 'revoked'
                        ? t('sharing.manager.revoked', 'Link revoked')
                        : (entry.validUntil ?? 0) > now &&
                            entry.readableSessionIds.includes(props.sessionId)
                          ? t('sharing.manager.active', 'Link is active')
                          : t('sharing.manager.unavailable', 'Link is currently unavailable')}
                    </span>
                  </span>
                  {entry.canRevoke && entry.status === 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmation({ kind: 'revoke', entry })}
                    >
                      {t('sharing.manager.revoke', 'Revoke link')}
                    </Button>
                  )}
                </div>
              ))}
            </section>
          )}
        </>
      )}
      {props.conflict && (
        <div role="status" className="space-y-2">
          <p>
            {t(
              'sharing.manager.conflict',
              'Sharing changed on another device. Reload the selection before making changes.'
            )}
          </p>
          <Button size="sm" variant="outline" disabled={busy} onClick={props.onReload}>
            {t('sharing.manager.reload', 'Reload selection')}
          </Button>
        </div>
      )}
      {confirmation && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmation(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmation.kind === 'reset'
                  ? t('sharing.manager.reset', 'Reset link')
                  : t('sharing.manager.revoke', 'Revoke link')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmation.kind === 'reset'
                  ? t(
                      'sharing.manager.confirmReset',
                      'Reset this link? The old link will stop working. Readers may finish an in-progress download before access ends.'
                    )
                  : t(
                      'sharing.manager.confirmRevoke',
                      'Revoke this entire link and its selected conversations? Other independent links and already downloaded content are unaffected.'
                    )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>
                {t('sharing.manager.cancel', 'Cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={
                  busy ||
                  props.conflict ||
                  (confirmation.kind === 'reset' &&
                    (mutationDisabled || confirmation.version !== rootVersion))
                }
                onClick={() => {
                  const action = confirmation;
                  setConfirmation(null);
                  if (action.kind === 'reset') props.onReset();
                  else props.onRevoke(action.entry);
                }}
              >
                {t('sharing.manager.confirm', 'Confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {props.error !== null && (
        <p role="alert" className="text-destructive">
          {props.error}
        </p>
      )}
      {props.notice !== null && (
        <p role="status" className="text-muted-foreground">
          {props.notice}
        </p>
      )}
    </div>
  );
}
