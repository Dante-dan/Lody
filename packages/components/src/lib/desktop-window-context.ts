import { atom } from 'jotai';
import type { IpcPushMap } from '@lody/shared/electron-ipc';

export type DesktopWindowContext = IpcPushMap['app.windowContext'];
let context: DesktopWindowContext | null = null;
export const desktopWindowContextAtom = atom<DesktopWindowContext | null>(null);
export const workspaceBackgroundOwnerAtom = atom(
  (get) => get(desktopWindowContextAtom)?.backgroundOwner ?? true
);
export function getDesktopWindowContext(): DesktopWindowContext | null {
  return context;
}
export function setDesktopWindowContext(value: DesktopWindowContext | null): void {
  context = value;
}
