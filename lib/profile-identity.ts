/** Shared with normal settings saves: identity edits must not race a stale snapshot. */
let queue: Promise<void> = Promise.resolve();
export function enqueueSettingsStorageOperation(operation: () => Promise<void>): Promise<void> {
  const result = queue.then(operation, operation);
  queue = result.catch(() => {});
  return result;
}
export interface ProfileIdentityUpdate {
  username: string;
  primaryInstrumentId?: string;
  profileIdentityRevision: string;
}
const listeners = new Set<(identity: ProfileIdentityUpdate) => void>();
export function subscribeProfileIdentity(listener: (identity: ProfileIdentityUpdate) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function publishProfileIdentity(identity: ProfileIdentityUpdate): void {
  listeners.forEach(listener => listener(identity));
}
