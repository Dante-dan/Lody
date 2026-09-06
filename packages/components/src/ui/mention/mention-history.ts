import type { Mention } from './mention-root';

export type MentionDraft = { text: string; mentions: Mention[] };
/** Bounded, synchronous edit history. Opaque payloads are immutable caller-owned values. */
export class MentionHistory {
  private past: MentionDraft[] = [];
  private future: MentionDraft[] = [];
  record(draft: MentionDraft) {
    if (this.past.at(-1) !== draft) this.past.push(draft);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
  }
  restore(current: MentionDraft, redo: boolean): MentionDraft | undefined {
    const from = redo ? this.future : this.past;
    const to = redo ? this.past : this.future;
    const draft = from.pop();
    if (draft) to.push(current);
    return draft;
  }
}
