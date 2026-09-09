// @vitest-environment jsdom
import { File as NodeFile } from 'node:buffer';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MachineId, SessionId, WorkspaceId } from '@lody/shared';
import { usePastedTextAttachments } from '../src/hooks/use-pasted-text-attachments';

const state = vi.hoisted(() => ({
  cloud: false,
  uploaded: [] as File[],
  local: [] as File[],
  fail: false,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock('@lody/platform/react', () => ({ usePlatformCapability: () => state.cloud }));
vi.mock('../src/atoms/local-probe', () => ({ localMachineIdAtom: 'local' }));
vi.mock('../src/atoms/runtime', () => ({ authTokenAtom: 'token' }));
vi.mock('jotai', async (importOriginal) => ({ ...(await importOriginal<object>()), useAtomValue: (atom: string) => atom }));
vi.mock('../src/lib/electron-session-file-sender', () => ({
  canUseElectronLocalFileSend: () => true,
  sendSessionFileToLocalRuntime: async ({ file }: { file: File }) => {
    state.local.push(file);
    return state.fail
      ? { ok: false }
      : { ok: true, files: [{ type: 'file', fileName: file.name, transport: 'local' }] };
  },
}));
vi.mock('../src/lib/session-file-upload', () => ({
  validateSessionFile: (file: File) => (file.size === 0 ? 'empty' : null),
  computeSha256Hex: async () => 'hash',
  uploadSessionFile: async ({ file, onProgress }: { file: File; onProgress?: (progress: { phase: 'uploading'; percent: number; loadedBytes: number; totalBytes: number }) => void }) => {
    onProgress?.({ phase: 'uploading', percent: 50, loadedBytes: file.size / 2, totalBytes: file.size });
    if (state.fail) throw new Error('upload failed');
    state.uploaded.push(file);
    return { type: 'file', fileName: file.name, transport: 'r2' };
  },
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  state.cloud = false;
  state.fail = false;
  state.uploaded = [];
  state.local = [];
  vi.unstubAllGlobals();
});
async function sender(machine: string) {
  vi.stubGlobal('File', NodeFile);
  let send!: ReturnType<typeof usePastedTextAttachments>;
  function Harness() {
    send = usePastedTextAttachments('workspace' as WorkspaceId, machine as MachineId);
    return null;
  }
  const div = document.createElement('div');
  const root = createRoot(div);
  await act(async () => root.render(createElement(Harness)));
  cleanups.push(async () => {
    await act(async () => root.unmount());
  });
  return send;
}
const draft = {
  id: 'synthetic',
  text: '  edited context\n',
  displayText: '[file]',
  start: 0,
  end: 6,
};

describe('pasted text file submission', () => {
  it('sends the edited bytes locally without an authenticated cloud request', async () => {
    const send = await sender('local');
    const blocks = await send([draft], 'session' as SessionId);
    expect(await state.local[0]!.text()).toBe(draft.text);
    expect(blocks).toEqual([
      { type: 'file', fileName: 'pasted-synthetic.txt', transport: 'local' },
    ]);
    expect(state.uploaded).toEqual([]);
    expect(draft.text).toBe('  edited context\n');
  });
  it('uploads to the selected remote destination when cloud sync is available', async () => {
    state.cloud = true;
    const send = await sender('remote');
    expect(await send([draft], 'session' as SessionId)).toEqual([
      { type: 'file', fileName: 'pasted-synthetic.txt', transport: 'r2' },
    ]);
    expect(await state.uploaded[0]!.text()).toBe(draft.text);
    expect(state.local).toEqual([]);
  });
  it('reports the current file and byte progress, and rejects a cancelled send', async () => {
    state.cloud = true;
    const send = await sender('remote');
    const progress: AttachmentProgress[] = [];
    await send([draft], 'session' as SessionId, [], { onProgress: item => progress.push(item) });
    expect(progress.at(-1)).toEqual({ phase: 'uploading', percent: 50,
      loadedBytes: new NodeFile([draft.text], 'context.txt').size / 2,
      totalBytes: new NodeFile([draft.text], 'context.txt').size,
      fileName: 'pasted-synthetic.txt', index: 0, count: 1 });
    const controller = new AbortController();
    controller.abort();
    await expect(send([draft], 'session' as SessionId, [], { signal: controller.signal })).rejects.toThrow();
    expect(state.uploaded.map(file => file.name)).toEqual(['pasted-synthetic.txt']);
  });
  it('fails without dropping the draft or falling back to cloud after local failure', async () => {
    state.fail = true;
    state.cloud = true;
    const send = await sender('local');
    await expect(send([draft], 'session' as SessionId)).rejects.toThrow();
    expect(state.uploaded).toEqual([]);
    expect(draft.text).toBe('  edited context\n');
  });
  it('rejects a remote send on the local-only platform', async () => {
    const send = await sender('remote');
    await expect(send([draft], 'session' as SessionId)).rejects.toThrow();
    expect(state.uploaded).toEqual([]);
  });
  it('rejects empty edited attachments rather than sending without their contents', async () => {
    const send = await sender('local');
    await expect(send([{ ...draft, text: '' }], 'session' as SessionId)).rejects.toThrow();
    expect(state.local).toEqual([]);
  });
});

// The same task is observed by the landing and destination route. Route mounts
// do not own its lifetime; accepting a user message still waits for uploaded bytes.
import {
  beginPendingAttachmentSubmission,
  usePendingAttachmentSubmissions,
  type AttachmentProgress,
} from '../src/components/chat/submission/pending-attachment-submission';
import { AttachmentSubmissionStatus } from '../src/components/chat/submission/attachment-submission-status';
import type { SessionInputBlock } from '@lody/shared';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function uploadPage() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  function Page() {
    const upload = usePendingAttachmentSubmissions()[0];
    return upload ? (
      <AttachmentSubmissionStatus {...upload} onRetry={upload.retry} onEdit={upload.cancel} />
    ) : (
      <p>No pending upload</p>
    );
  }
  await act(async () => root.render(<Page />));
  const unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  cleanups.push(unmount);
  return { container, unmount };
}
const uploadIdentity = {
  sessionId: 'pending-session',
  ownerId: 'user',
  workspaceSlug: 'workspace',
  returnHref: '/workspace/chat',
  text: 'Synthetic message [file]',
};

describe('pending attachment submission', () => {
  it('keeps progress across route mounts and resolves only after upload verification', async () => {
    const transfer = deferred<SessionInputBlock[]>();
    let report!: (progress: AttachmentProgress) => void;
    const task = beginPendingAttachmentSubmission(uploadIdentity, async (_signal, onProgress) => {
      report = onProgress;
      return transfer.promise;
    });
    cleanups.push(async () => { await act(async () => task.complete()); });
    let accepted: SessionInputBlock[] | null = null;
    void task.uploaded.then((blocks) => {
      accepted = blocks;
    });
    const first = await uploadPage();
    await act(async () =>
      report({
        phase: 'uploading',
        percent: 40,
        loadedBytes: 4,
        totalBytes: 10,
        fileName: 'context.txt',
        index: 0,
        count: 1,
      })
    );
    expect(first.container.textContent).toContain('Your message has not been sent yet');
    expect(first.container.querySelector('progress')?.value).toBe(40);
    expect(accepted).toBeNull();
    await first.unmount();
    const second = await uploadPage();
    expect(second.container.querySelector('progress')?.value).toBe(40);
    const blocks: SessionInputBlock[] = [{ type: 'text', text: 'synthetic uploaded result' }];
    await act(async () => transfer.resolve(blocks));
    expect(accepted).toEqual(blocks);
    expect(second.container.textContent).toContain('Submitting message');
    expect(second.container.querySelector('button')).toBeNull();
    await act(async () => task.complete());
    expect(second.container.textContent).toBe('No pending upload');
  });

  it('retains unsent content after failure and retries without accepting twice', async () => {
    let transfer = deferred<SessionInputBlock[]>();
    const task = beginPendingAttachmentSubmission(uploadIdentity, () => transfer.promise);
    cleanups.push(async () => { await act(async () => task.complete()); });
    const page = await uploadPage();
    let accepted: SessionInputBlock[] | null = null;
    void task.uploaded.then((blocks) => {
      accepted = blocks;
    });
    await act(async () => transfer.reject(new Error('offline')));
    expect(page.container.textContent).toContain('Your message has not been sent');
    expect(page.container.textContent).toContain(uploadIdentity.text);
    expect(accepted).toBeNull();
    transfer = deferred<SessionInputBlock[]>();
    const retry = Array.from(page.container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Retry upload'
    )!;
    await act(async () => {
      retry.click();
      retry.click();
    });
    const blocks: SessionInputBlock[] = [{ type: 'text', text: 'retried result' }];
    await act(async () => transfer.resolve(blocks));
    expect(accepted).toEqual(blocks);
    await act(async () => task.fail());
    expect(page.container.textContent).toContain('Your message has not been sent');
    expect(
      Array.from(page.container.querySelectorAll('button')).map((button) => button.textContent)
    ).toEqual(['Return to edit']);
  });

  it('aborts on return to edit and ignores late upload completion', async () => {
    const transfer = deferred<SessionInputBlock[]>();
    let signal!: AbortSignal;
    const task = beginPendingAttachmentSubmission(uploadIdentity, async (currentSignal) => {
      signal = currentSignal;
      return transfer.promise;
    });
    const outcome = task.uploaded.then(
      () => 'accepted',
      () => 'cancelled'
    );
    const page = await uploadPage();
    await act(async () => page.container.querySelector('button')!.click());
    expect(signal.aborted).toBe(true);
    expect(await outcome).toBe('cancelled');
    await act(async () => transfer.resolve([]));
    expect(page.container.textContent).toBe('No pending upload');
    expect(task.isActive()).toBe(false);
  });
});
