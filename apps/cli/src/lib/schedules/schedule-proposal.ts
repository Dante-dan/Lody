import {
  getServerNow,
  type MessageContent,
  type ScheduleProposalMeta,
  type SessionHistoryInput,
} from '@lody/shared';

export type ScheduleProposalDraft = Pick<
  ScheduleProposalMeta,
  'proposalId' | 'title' | 'prompt' | 'rule' | 'destination' | 'target'
>;

export type ScheduleProposalActor = { agentConfigId?: string; name?: string };

export type ScheduleProposalPublishResult =
  | { pending: true }
  | { pending: false; outcome: 'created'; scheduleId?: string }
  | { pending: false; outcome: 'dismissed' };

type ProposalDocument = {
  roomId: string;
  updateHistory(update: (history: SessionHistoryInput[]) => SessionHistoryInput[]): Promise<void>;
};

const sameDraft = (current: ScheduleProposalMeta, desired: ScheduleProposalMeta): boolean =>
  JSON.stringify({
    ...current,
    outcome: undefined,
    scheduleId: undefined,
  }) === JSON.stringify({ ...desired, outcome: undefined, scheduleId: undefined });

/**
 * Write a schedule proposal card into the invoking conversation.
 *
 * It is a `system_notice` history item, like a task proposal, so it survives
 * the turn and stays actionable days later. Idempotent on `proposalId`: a retry
 * with the same draft is a no-op, a retry with a different draft is a conflict,
 * and a proposal the person already acted on reports that outcome instead of
 * being rewritten.
 */
export async function publishScheduleProposal(
  doc: ProposalDocument,
  draft: ScheduleProposalDraft,
  actor: ScheduleProposalActor,
  now: () => number = getServerNow
): Promise<ScheduleProposalPublishResult> {
  const desired: ScheduleProposalMeta = {
    ...draft,
    proposedBy: {
      kind: 'agent',
      ...(actor.agentConfigId ? { agentConfigId: actor.agentConfigId } : {}),
      ...(actor.name ? { name: actor.name } : {}),
    },
  };
  const item: MessageContent = { type: 'system_notice', name: 'schedule_proposal', meta: desired };
  const entryId = `schedule-proposal-${draft.proposalId}`;
  let result: ScheduleProposalPublishResult = { pending: true };
  await doc.updateHistory((history) => {
    const existing = history.find((entry) => entry.id === entryId);
    if (!existing)
      return [
        ...history,
        {
          id: entryId,
          role: 'system',
          timestamp: new Date(now()).toISOString(),
          items: [item],
          fileDiff: [],
          finished: true,
        },
      ];
    const prior = existing.items?.find(
      (candidate) => candidate.type === 'system_notice' && candidate.name === 'schedule_proposal'
    );
    const current =
      prior?.type === 'system_notice' && prior.name === 'schedule_proposal'
        ? (prior.meta as ScheduleProposalMeta | undefined)
        : undefined;
    if (!current || !sameDraft(current, desired)) throw new Error('Idempotency key conflict');
    if (current.outcome === 'created')
      result = { pending: false, outcome: 'created', scheduleId: current.scheduleId };
    else if (current.outcome === 'dismissed') result = { pending: false, outcome: 'dismissed' };
    return history;
  });
  return result;
}
