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
vi.mock('jotai', () => ({ useAtomValue: (atom: string) => atom }));
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
  uploadSessionFile: async ({ file }: { file: File }) => {
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
