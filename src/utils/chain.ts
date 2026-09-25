import { fingerprint } from './fingerprint';
import { NoteBlob } from './types';

/** Identity of a note's text. Parent links are excluded so a relink stays one version. */
export function noteVersionKey(blob: NoteBlob): string {
  return fingerprint({
    path: blob.path,
    title: blob.title,
    body: blob.body,
    tags: blob.tags,
    createdAt: blob.createdAt,
    agent: blob.agent || null,
    kind: 'note' as const,
  });
}

export function preferNoteVersion(
  current: NoteBlob,
  next: NoteBlob,
  onChain?: ReadonlySet<string>,
): NoteBlob {
  if (onChain) {
    const currentOn = onChain.has(current.fingerprint);
    const nextOn = onChain.has(next.fingerprint);
    if (currentOn !== nextOn) {
      return nextOn ? next : current;
    }
  }

  const currentLinked = current.parent != null;
  const nextLinked = next.parent != null;
  if (currentLinked !== nextLinked) {
    return nextLinked ? next : current;
  }
  return next.fingerprint > current.fingerprint ? next : current;
}

export function compareNoteVersions(left: NoteBlob, right: NoteBlob): number {
  if (left.createdAt < right.createdAt) {
    return -1;
  }
  if (left.createdAt > right.createdAt) {
    return 1;
  }
  // Fingerprints change when a note is relinked, so a second sync would
  // reorder equal timestamps and publish again. The version key does not.
  const leftKey = noteVersionKey(left);
  const rightKey = noteVersionKey(right);
  if (leftKey < rightKey) {
    return -1;
  }
  if (leftKey > rightKey) {
    return 1;
  }
  return 0;
}

export function relinkNote(blob: NoteBlob, parent: string | null): NoteBlob {
  const payload = {
    path: blob.path,
    title: blob.title,
    body: blob.body,
    tags: blob.tags,
    parent,
    createdAt: blob.createdAt,
    agent: blob.agent || null,
    kind: 'note' as const,
  };
  return {
    fingerprint: fingerprint(payload),
    path: blob.path,
    title: blob.title,
    body: blob.body,
    tags: blob.tags,
    parent,
    createdAt: blob.createdAt,
    agent: blob.agent,
    kind: 'note',
  };
}
