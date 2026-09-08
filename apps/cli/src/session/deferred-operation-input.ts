import type { SessionId } from '@lody/shared';

/** Synchronous hooks: committing the input and calling the provider share one JS turn. */
export type DeferredOperationInput = {
  text: string;
  settle: (outcome: 'handled' | 'cancelled' | 'uncertain' | 'not_started') => void;
};

export type DeferredOperationControl = {
  stop: (sessionId: SessionId, sourceTurnId: string) => void;
  startInput: (
    sessionId: SessionId,
    userTurnId: string,
    userId: string,
    stopVersion?: number
  ) => DeferredOperationInput | undefined;
};
