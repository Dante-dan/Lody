import { RepoStorageError, type LoadedFlockReplica, type StorageAdapter } from 'loro-repo';

export type RepoStorageCrisis = {
  readonly code: 'quota' | 'unavailable';
  readonly error: RepoStorageError;
};

/** Sticky per-Repo ownership. Recovery requires a new runtime after explicit restart. */
export function createRepoStorageCrisis(onCrisis?: (crisis: RepoStorageCrisis) => void) {
  let crisis: RepoStorageCrisis | null = null;
  const assertHealthy = () => {
    if (crisis) throw crisis.error;
  };
  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    assertHealthy();
    try {
      return await operation();
    } catch (error) {
      if (
        !crisis &&
        error instanceof RepoStorageError &&
        (error.code === 'quota' || error.code === 'unavailable')
      ) {
        crisis = { code: error.code, error };
        // Observer failures must not hide the original persistence failure.
        try {
          onCrisis?.(crisis);
        } catch (observerError) {
          console.error('Repo storage crisis observer failed', observerError);
        }
      }
      throw error;
    }
  };
  const wrapReplica = (replica: LoadedFlockReplica): LoadedFlockReplica => {
    const store = replica.checkpointStore;
    return {
      flock: replica.flock,
      checkpointStore: {
        load: (url) => run(() => store.load(url)),
        save: (cursor) => run(() => store.save(cursor)),
        ...(store.delete ? { delete: (url: string) => run(() => store.delete!(url)) } : {}),
      },
    };
  };
  const wrapStorage = (storage: StorageAdapter): StorageAdapter => ({
    save: (payload) => run(() => storage.save(payload)),
    loadDoc: (id) => run(() => storage.loadDoc(id)),
    loadMeta: () => run(() => storage.loadMeta()),
    ...(storage.init ? { init: () => run(() => storage.init!()) } : {}),
    // Closing releases resources; it must remain possible during crisis.
    ...(storage.close ? { close: () => storage.close!() } : {}),
    ...(storage.saveMany ? { saveMany: (payloads) => run(() => storage.saveMany!(payloads)) } : {}),
    ...(storage.compactMeta ? { compactMeta: () => run(() => storage.compactMeta!()) } : {}),
    ...(storage.compactFlockDoc
      ? { compactFlockDoc: (id) => run(() => storage.compactFlockDoc!(id)) }
      : {}),
    ...(storage.loadFlockDoc ? { loadFlockDoc: (id) => run(() => storage.loadFlockDoc!(id)) } : {}),
    ...(storage.deleteDoc ? { deleteDoc: (id) => run(() => storage.deleteDoc!(id)) } : {}),
    ...(storage.deleteFlockDoc
      ? { deleteFlockDoc: (id) => run(() => storage.deleteFlockDoc!(id)) }
      : {}),
    ...(storage.loadMetaReplica
      ? { loadMetaReplica: () => run(async () => wrapReplica(await storage.loadMetaReplica!())) }
      : {}),
    ...(storage.loadFlockDocReplica
      ? {
          loadFlockDocReplica: (id) =>
            run(async () => wrapReplica(await storage.loadFlockDocReplica!(id))),
        }
      : {}),
  });
  return { assertHealthy, wrapStorage, getCrisis: () => crisis };
}
