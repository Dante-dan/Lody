import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionShareManagement, SessionShareManagementEntry } from '@lody/cloud-api';
import { SESSION_SHARE_MAX_TARGETS } from '@lody/shared/session-sharing';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import { cn } from '@/lib/utils';
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
  /** Optional control that narrows the candidate list, rendered inside its section. */
  filter?: ReactNode;
  /** Shown under the filter when the candidate list was truncated. */
  filterNote?: string | null;
  onSelect: (ids: string[]) => void;
  onReload: () => void;
  onCreate: () => void;
  onSave: () => void;
  onReset: () => void;
  onCopy: (entry: SessionShareManagementEntry) => void;
  onRevoke: (entry: SessionShareManagementEntry) => void;
};

/**
 * Controlled, responsive management UI shared by Web, Electron and Mobile.
 *
 * One vertical read: what the link is and does, what it covers, then the
 * consent and the actions. Each meaning is stated once — the disclosure sits on
 * the link it describes, the selection rule sits on the selection, and the
 * action row sticks to the bottom of the dialog's scrolling body so the primary
 * action stays reachable on a phone.
 */
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
  const someUnavailable = candidateIds.some((id) => !eligible(id));
  const status = rootLive
    ? t('sharing.manager.active', 'Link active')
    : root?.status === 'revoked'
      ? t('sharing.manager.revoked', 'Link revoked')
      : root
        ? t('sharing.manager.unavailable', 'Link is currently unavailable')
        : t('sharing.manager.noLink', 'No share link yet');
  const messages = [
    props.error !== null ? { role: 'alert' as const, text: props.error, bad: true } : null,
    props.notice !== null ? { role: 'status' as const, text: props.notice, bad: false } : null,
  ].flatMap((entry) => (entry ? [entry] : []));

  return (
    <div className="text-sm" aria-busy={busy}>
      {props.conflict && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/60 px-4 py-2.5 text-xs sm:px-5"
        >
          <p className="min-w-0 leading-5">
            {t(
              'sharing.manager.conflict',
              'Sharing changed on another device. Reload before making changes.'
            )}
          </p>
          <Button size="sm" variant="outline" disabled={busy} onClick={props.onReload}>
            {t('sharing.manager.reload', 'Reload selection')}
          </Button>
        </div>
      )}
      <div className="space-y-5 px-4 py-4 sm:px-5">
        {!state ? (
          <p role="status" className="text-muted-foreground">
            {t('sharing.manager.loading', 'Loading sharing settings…')}
          </p>
        ) : (
          <>
            <section className="rounded-lg border border-border px-3 py-2.5">
              {/* Wraps rather than truncates: a narrow phone must never shorten
                  the link's state to make room for its own buttons. */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p className="flex min-w-0 items-center gap-2 font-medium">
                  <span
                    aria-hidden
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      rootLive ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                    )}
                  />
                  <span className="truncate">{status}</span>
                </p>
                {root && (rootLive || root.canRevoke) && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {rootLive && hasSecret && (
                      <Button size="sm" disabled={busy} onClick={() => props.onCopy(root)}>
                        {t('sharing.manager.copy', 'Copy share link')}
                      </Button>
                    )}
                    {root.canRevoke && root.status === 'active' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        disabled={busy}
                        onClick={() => setConfirmation({ kind: 'revoke', entry: root })}
                      >
                        {t('sharing.manager.revoke', 'Revoke link')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {t(
                  'sharing.manager.disclosure',
                  'Anyone with the link reads the selected conversations in full — original documents, history, attachments and later updates. Links can be forwarded and are not end-to-end encrypted.'
                )}
              </p>
              {root?.status === 'active' && root.canManage && !hasSecret && (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t(
                    'sharing.manager.missingSecret',
                    'This device does not have the link secret. Reset the link to copy it again; the old link stops working.'
                  )}
                </p>
              )}
            </section>
            {canManage && (
              <section className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-medium">
                    {t('sharing.manager.scope', 'Conversations in this link')}
                  </h3>
                  <span
                    className="shrink-0 text-xs tabular-nums text-muted-foreground"
                    aria-label={t(
                      'sharing.manager.limitLabel',
                      '{{count}} of {{max}} conversations selected',
                      { count: selected.length, max: SESSION_SHARE_MAX_TARGETS }
                    )}
                  >
                    {t('sharing.manager.limit', '{{count}} / {{max}}', {
                      count: selected.length,
                      max: SESSION_SHARE_MAX_TARGETS,
                    })}
                  </span>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t(
                    'sharing.manager.explicit',
                    'New conversations are never added automatically.'
                  )}
                </p>
                {props.filter}
                {props.filterNote != null && props.filterNote !== '' && (
                  <p className="text-xs text-muted-foreground">{props.filterNote}</p>
                )}
                {/* Only the targets are frozen mid-mutation; narrowing a long
                    candidate list stays available while a save is in flight. */}
                <fieldset disabled={busy || props.conflict}>
                  <legend className="sr-only">
                    {t('sharing.manager.scope', 'Conversations in this link')}
                  </legend>
                  <div className="-mx-1 max-h-52 overflow-y-auto overscroll-contain px-1">
                  {candidateIds.map((id) => {
                    const checked = selected.includes(id);
                    const available = eligible(id);
                    return (
                      <label
                        key={id}
                        className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 hover:bg-hover"
                      >
                        <Checkbox
                          className="mt-0.5 shrink-0"
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
                        <span className="min-w-0 flex-1 break-words">{title(id)}</span>
                        {!available && (
                          <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[0.6875rem] leading-4 text-muted-foreground">
                            {t('sharing.manager.notVerified', 'Not ready')}
                          </span>
                        )}
                      </label>
                    );
                  })}
                  </div>
                </fieldset>
                {someUnavailable && (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t(
                      'sharing.manager.notVerifiedHint',
                      'Not ready: needs cloud sync and author verification.'
                    )}
                  </p>
                )}
              </section>
            )}
            {others.length > 0 && (
              <section className="space-y-1 border-t border-border pt-4">
                <h3 className="font-medium">
                  {t('sharing.manager.otherSources', 'Other links including this conversation')}
                </h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t(
                    'sharing.manager.independent',
                    'Revoking one link does not affect the others.'
                  )}
                </p>
                <ul className="pt-1">
                  {others.map((entry) => (
                    <li
                      key={entry.shareId}
                      className="flex items-center justify-between gap-3 py-1.5"
                    >
                      <span className="min-w-0 break-words">
                        {(entry.title ?? '') || title(entry.rootSessionId)}
                        <span className="block text-xs text-muted-foreground">
                          {entry.status === 'revoked'
                            ? t('sharing.manager.revoked', 'Link revoked')
                            : (entry.validUntil ?? 0) > now &&
                                entry.readableSessionIds.includes(props.sessionId)
                              ? t('sharing.manager.active', 'Link active')
                              : t('sharing.manager.unavailable', 'Link is currently unavailable')}
                        </span>
                      </span>
                      {entry.canRevoke && entry.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          disabled={busy}
                          onClick={() => setConfirmation({ kind: 'revoke', entry })}
                        >
                          {t('sharing.manager.revoke', 'Revoke link')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      {/* The consent gate travels with the buttons it gates, so a long candidate
          list can never scroll it out of sight while the actions stay pinned. */}
      {state && (canManage || messages.length > 0) && (
        <div className="sticky bottom-0 space-y-3 border-t border-border bg-background px-4 py-3 sm:px-5">
          {canManage && (
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
                  'I understand anyone with this link can read everything selected.'
                )}
              </span>
            </label>
          )}
          {messages.map((message) => (
            <p
              key={message.role}
              role={message.role}
              className={cn(
                'text-xs leading-5',
                message.bad ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {message.text}
            </p>
          ))}
          {canManage && (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {!root ? (
                <Button disabled={mutationDisabled} onClick={props.onCreate}>
                  {t('sharing.manager.create', 'Create share link')}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    disabled={mutationDisabled}
                    onClick={() => setConfirmation({ kind: 'reset', version: rootVersion })}
                  >
                    {t('sharing.manager.reset', 'Reset link')}
                  </Button>
                  {root.status === 'active' && (
                    <Button
                      disabled={mutationDisabled || !changed || !rootLive || !hasSecret}
                      onClick={props.onSave}
                    >
                      {t('sharing.manager.save', 'Save selection')}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
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
                      'The old link stops working and you get a new one. Readers may finish an in-progress download before access ends.'
                    )
                  : t(
                      'sharing.manager.confirmRevoke',
                      'This link and every conversation in it stop being readable. Other links and already downloaded content are unaffected.'
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
    </div>
  );
}
