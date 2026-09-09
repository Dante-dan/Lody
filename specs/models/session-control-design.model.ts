/** Executable proposal, NOT the production state machine. Run with Node 24. */
type Root = 'h1' | 'h2'; // Existing human Turn ids, never Stop counters.
type Active = 'none' | 'human1' | 'auto1' | 'human2' | 'auto2';
type Receipt = 'none' | 'pending' | 'stopped' | 'obsolete';
type Input = 'none' | 'started' | 'consumed' | 'uncertain';
type State = {
  root: Root;
  active: Active;
  receipt: Receipt;
  gate: boolean;
  held: boolean;
  disk: boolean;
  oldReady: boolean;
  queued: boolean;
  include: boolean;
  input: Input;
  attached: boolean;
};
type Bug = 'none' | 'legacy-stop' | 'ack-before-commit' | 'ignore-successor';
const events = [
  'old-result',
  'auto-old',
  'finish',
  'queue-include',
  'queue-exclude',
  'submit-human',
  'auto-new',
  'stop-a',
  'legacy-cancel-a',
  'cancel-current',
  'commit-stop',
  'disk-down',
  'disk-up',
  'restart',
] as const;
type ModelEvent = (typeof events)[number];
const initial = (): State => ({
  root: 'h1',
  active: 'human1',
  receipt: 'none',
  gate: false,
  held: false,
  disk: true,
  oldReady: false,
  queued: false,
  include: true,
  input: 'none',
  attached: false,
});
function assertModel(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
function step(before: State, event: ModelEvent, bug: Bug = 'none'): State {
  const s = { ...before };
  switch (event) {
    case 'old-result':
      s.oldReady = true;
      break;
    case 'auto-old':
      if (!s.gate && !s.held && s.root === 'h1' && s.active === 'none' && s.oldReady) {
        s.active = 'auto1';
      }
      break;
    case 'auto-new':
      if (!s.gate && s.root === 'h2' && s.active === 'none') s.active = 'auto2';
      break;
    case 'finish':
      if (s.active === 'human2' && s.input === 'started') s.input = 'consumed';
      s.active = 'none';
      break;
    case 'queue-include':
    case 'queue-exclude':
      if (s.root === 'h1' && !s.queued) {
        s.queued = true;
        s.include = event === 'queue-include';
      }
      break;
    case 'submit-human':
      if (s.queued && !s.gate && s.disk && s.active === 'none') {
        s.queued = false;
        s.root = 'h2';
        s.active = 'human2';
        s.input = 'started';
        s.attached = s.include && s.held && s.oldReady;
      }
      break;
    case 'legacy-cancel-a':
      if (bug === 'legacy-stop') return step(before, 'stop-a');
      if (s.active === 'human1') s.active = 'none';
      break;
    case 'cancel-current':
      if (s.active === 'human2' && s.input === 'started') s.input = 'consumed';
      s.active = 'none';
      break;
    case 'stop-a':
      if (s.receipt !== 'none') break; // Same semantic command is idempotent.
      if (s.root === 'h2') {
        s.receipt = 'obsolete';
        break;
      }
      if (bug === 'ignore-successor' && s.active === 'auto1') break;
      // The command is already in a durable inbox. Hold retries have one owner.
      s.receipt = 'pending';
      s.gate = true;
      s.active = 'none'; // Best-effort cancellation is separate from durable acknowledgement.
      break;
    case 'commit-stop':
      if (s.receipt !== 'pending') break;
      if (!s.disk) {
        if (bug === 'ack-before-commit') {
          s.receipt = 'stopped';
          s.gate = false;
        }
        break;
      }
      s.held = true;
      s.receipt = 'stopped';
      s.gate = false;
      break;
    case 'disk-down':
      s.disk = false;
      break;
    case 'disk-up':
      s.disk = true;
      break;
    case 'restart':
      s.active = 'none';
      if (s.input === 'started') s.input = 'uncertain';
      s.gate = s.receipt === 'pending'; // Inbox restored before any scheduler work.
      break;
  }
  return s;
}
function check(before: State, event: ModelEvent, after: State): void {
  assertModel(
    after.receipt !== 'stopped' || after.held,
    'R4: stopped acknowledgement without durable hold'
  );
  assertModel(
    after.receipt !== 'pending' || after.gate,
    'R5: pending Stop lost its admission gate'
  );
  assertModel(!after.held || after.active !== 'auto1', 'R2: old automatic work runs after Stop');
  if (event === 'legacy-cancel-a' || event === 'cancel-current') {
    assertModel(
      after.held === before.held && after.receipt === before.receipt,
      'R1: legacy/internal cancel acquired Stop meaning'
    );
  }
  if (event === 'stop-a' && before.root === 'h1' && before.receipt === 'none') {
    assertModel(
      after.receipt === 'pending' && after.active === 'none',
      'R3: Stop ignored an automatic successor'
    );
  }
  if (event === 'stop-a' && before.root === 'h2') {
    assertModel(
      after.active === before.active && after.held === before.held,
      'R3: old Stop crossed a human boundary'
    );
  }
  if (before.gate && (event === 'submit-human' || event === 'auto-new' || event === 'auto-old')) {
    assertModel(
      after.active === before.active && after.root === before.root,
      'R5: work passed an uncommitted Stop'
    );
  }
  if (
    event === 'submit-human' &&
    before.queued &&
    !before.gate &&
    before.disk &&
    before.active === 'none'
  ) {
    assertModel(
      after.attached === (before.include && before.held && before.oldReady),
      'R6: input did not honor ready snapshot/choice'
    );
  }
  if (before.input === 'uncertain')
    assertModel(after.input === 'uncertain', 'R7: uncertain input was automatically replayed');
  if (event === 'auto-new' && before.root === 'h2' && !before.gate && before.active === 'none') {
    assertModel(after.active === 'auto2', 'R8: old hold blocked unrelated new work');
  }
}
function explore(bug: Bug, depth: number) {
  const visited = new Set<string>();
  const work = [{ state: initial(), trace: [] as ModelEvent[] }];
  visited.add(JSON.stringify(work[0]!.state));
  let transitions = 0;
  for (let i = 0; i < work.length; i++) {
    const { state, trace } = work[i]!;
    if (trace.length === depth) continue;
    for (const event of events) {
      const next = step(state, event, bug);
      transitions++;
      try {
        check(state, event, next);
      } catch (error) {
        return {
          bug,
          states: visited.size,
          transitions,
          counterexample: [...trace, event],
          violation: String(error),
        };
      }
      const key = JSON.stringify(next);
      if (!visited.has(key)) {
        visited.add(key);
        work.push({ state: next, trace: [...trace, event] });
      }
    }
  }
  return { bug, states: visited.size, transitions, counterexample: null, violation: null };
}
function trace(...actions: ModelEvent[]) {
  return actions.reduce((state, event) => {
    const next = step(state, event);
    check(state, event, next);
    return next;
  }, initial());
}
const scenarios = {
  queuedBeforeStop: trace('queue-include', 'old-result', 'stop-a', 'commit-stop', 'submit-human'),
  excludedShortcut: trace('queue-exclude', 'old-result', 'stop-a', 'commit-stop', 'submit-human'),
  lateResult: trace('queue-include', 'stop-a', 'commit-stop', 'submit-human', 'old-result'),
  stopRetryAfterRestart: trace(
    'disk-down',
    'stop-a',
    'commit-stop',
    'restart',
    'disk-up',
    'commit-stop'
  ),
  oldStopAfterNewHuman: trace('queue-include', 'finish', 'submit-human', 'stop-a'),
  crashAfterInput: trace(
    'queue-include',
    'old-result',
    'stop-a',
    'commit-stop',
    'submit-human',
    'restart'
  ),
};
assertModel(scenarios.queuedBeforeStop.attached, 'Prequeued human input must be accepted');
assertModel(!scenarios.excludedShortcut.attached, 'Checkbox exclusion must survive submission');
assertModel(
  !scenarios.lateResult.attached && scenarios.lateResult.oldReady,
  'Late result must wait'
);
assertModel(
  scenarios.stopRetryAfterRestart.receipt === 'stopped',
  'Recovered Stop must settle when storage recovers'
);
assertModel(
  scenarios.oldStopAfterNewHuman.active === 'human2',
  'New human input must survive old Stop'
);
assertModel(
  scenarios.crashAfterInput.input === 'uncertain',
  'Crash after provider submission is uncertain'
);
const depth = 12;
const results = (['none', 'legacy-stop', 'ack-before-commit', 'ignore-successor'] as const).map(
  (bug) => explore(bug, depth)
);
assertModel(results[0]!.counterexample === null, 'Proposal model failed');
for (const result of results.slice(1))
  assertModel(result.counterexample !== null, `Mutation ${result.bug} was not detected`);
console.log(
  JSON.stringify(
    { depth, eventCount: events.length, scenarioCount: Object.keys(scenarios).length, results },
    null,
    2
  )
);
