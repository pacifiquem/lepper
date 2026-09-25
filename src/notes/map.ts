import path from 'path';
import { collectDirectories } from './directories';
import { listNotes } from './notes';
import { Store } from '../utils/store';
import { MapNode, NoteSummary } from '../utils/types';

function nodeFor(dirPath: string, notes: Map<string, NoteSummary>): MapNode {
  const note = notes.get(dirPath);
  return {
    path: dirPath,
    title: note?.title,
    excerpt: note?.excerpt,
    fingerprint: note?.fingerprint,
    recorded: Boolean(note),
    children: [],
  };
}

function attach(root: MapNode, child: MapNode): void {
  const parentPath = child.path === '.' ? null : path.posix.dirname(child.path);
  const parentKey = parentPath === '.' || parentPath === '' ? '.' : parentPath;

  const find = (node: MapNode): MapNode | undefined => {
    if (node.path === parentKey) {
      return node;
    }
    for (const next of node.children) {
      const match = find(next);
      if (match) {
        return match;
      }
    }
    return undefined;
  };

  const parent = find(root);
  if (parent) {
    parent.children.push(child);
    parent.children.sort((a, b) => a.path.localeCompare(b.path));
    return;
  }

  root.children.push(child);
  root.children.sort((a, b) => a.path.localeCompare(b.path));
}

export function projectMap(store: Store, prefix?: string): MapNode {
  const notes = new Map(listNotes(store).map((note) => [note.path, note]));
  const directories = collectDirectories(store.root);
  const root = nodeFor('.', notes);
  const wanted = prefix && prefix !== '.' ? prefix : undefined;

  const paths = new Set<string>(
    ['.'].concat(directories, Array.from(notes.keys())),
  );
  const ordered = Array.from(paths)
    .filter((dir) => dir !== '.')
    .sort(
      (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b),
    );

  for (const dir of ordered) {
    if (wanted && dir !== wanted && !dir.startsWith(`${wanted}/`)) {
      continue;
    }
    attach(root, nodeFor(dir, notes));
  }

  if (wanted) {
    const find = (node: MapNode): MapNode | undefined => {
      if (node.path === wanted) {
        return node;
      }
      for (const child of node.children) {
        const match = find(child);
        if (match) {
          return match;
        }
      }
      return undefined;
    };
    return find(root) || nodeFor(wanted, notes);
  }

  return root;
}

export function formatMap(node: MapNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  const label = node.path === '.' ? '.' : node.path;
  const detail = node.recorded
    ? `${node.title || node.excerpt || 'recorded'} [${(
        node.fingerprint || ''
      ).slice(0, 12)}]`
    : 'unrecorded';
  const lines = [`${indent}${label}  —  ${detail}`];
  for (const child of node.children) {
    lines.push(formatMap(child, depth + 1));
  }
  return lines.join('\n');
}
