import { ensureMigrated } from './migrate';
import { followMovedPaths } from './follow';
import { withStore, Store } from '../utils/store';

export function withLepper<T>(
  cwd: string,
  fn: (store: Store) => T,
  create = true,
): T {
  return withStore(
    cwd,
    (store) => {
      if (create) {
        ensureMigrated(store);
        followMovedPaths(store);
      }
      return fn(store);
    },
    create,
  );
}
