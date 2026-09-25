import { CliError } from '../utils/errors';
import { fingerprint, shortFingerprint } from '../utils/fingerprint';
import { readDiary, Store, writeDiary } from '../utils/store';
import { DiaryBrief, DiaryEntry, DiaryIndex } from '../utils/types';

export interface DiaryInput {
  work: string;
  wentWell?: string[];
  wentWrong?: string[];
  agent?: string;
}

function agentOf(input?: string): string | undefined {
  return input?.trim() || process.env.LEPPER_AGENT || undefined;
}

export function diaryLines(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const value of values || []) {
    const text = value.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    lines.push(text);
  }
  return lines;
}

export function writeDiaryEntry(store: Store, input: DiaryInput): DiaryEntry {
  const work = input.work.trim().replace(/\s+/g, ' ');
  if (!work) {
    throw new CliError('Diary work cannot be empty.');
  }
  const wentWell = diaryLines(input.wentWell);
  const wentWrong = diaryLines(input.wentWrong);
  if (wentWell.length === 0 && wentWrong.length === 0) {
    throw new CliError(
      'A diary entry needs at least one thing that went well or went wrong.',
    );
  }

  const createdAt = new Date().toISOString();
  const agent = agentOf(input.agent);
  const payload = {
    work,
    wentWell,
    wentWrong,
    createdAt,
    agent: agent || null,
  };
  const fp = fingerprint(payload);
  const entry: DiaryEntry = {
    id: `diary-${shortFingerprint(fp, 8)}`,
    fingerprint: fp,
    work,
    wentWell,
    wentWrong,
    createdAt,
    agent,
  };

  const index = readDiary(store);
  index.entries[entry.id] = entry;
  writeDiary(store, index);
  return entry;
}

export function listDiary(store: Store, limit = 20): DiaryEntry[] {
  const indexed = Object.values(readDiary(store).entries).map(
    (entry, index) => ({ entry, index }),
  );
  indexed.sort((a, b) => {
    if (a.entry.createdAt === b.entry.createdAt) {
      return b.index - a.index;
    }
    return a.entry.createdAt < b.entry.createdAt ? 1 : -1;
  });
  const entries = indexed.map((item) => item.entry);
  return limit > 0 ? entries.slice(0, limit) : entries;
}

export function recallDiary(store: Store, limit = 20): DiaryBrief {
  const recent = listDiary(store, limit);
  const stance = new Map<string, { text: string; kind: 'keep' | 'stop' }>();
  for (const entry of recent) {
    for (const line of entry.wentWell) {
      const key = line.toLowerCase();
      if (!stance.has(key)) {
        stance.set(key, { text: line, kind: 'keep' });
      }
    }
    for (const line of entry.wentWrong) {
      const key = line.toLowerCase();
      if (!stance.has(key)) {
        stance.set(key, { text: line, kind: 'stop' });
      }
    }
  }

  const keep: string[] = [];
  const stop: string[] = [];
  stance.forEach((item) => {
    if (item.kind === 'keep') {
      keep.push(item.text);
    } else {
      stop.push(item.text);
    }
  });

  return {
    keep,
    stop,
    recent: recent.map((entry) => ({
      id: entry.id,
      work: entry.work,
      createdAt: entry.createdAt,
      agent: entry.agent,
    })),
  };
}

export function mergeDiary(
  local: DiaryIndex,
  incoming: DiaryIndex,
): DiaryIndex {
  const entries = { ...local.entries };
  for (const [id, remote] of Object.entries(incoming.entries || {})) {
    const current = entries[id];
    if (!current || remote.createdAt > current.createdAt) {
      entries[id] = remote;
    }
  }
  return {
    version: local.version,
    updatedAt: new Date().toISOString(),
    entries,
  };
}

export function sameDiary(left: DiaryIndex, right: DiaryIndex): boolean {
  const leftKeys = Object.keys(left.entries);
  if (leftKeys.length !== Object.keys(right.entries).length) {
    return false;
  }
  for (const key of leftKeys) {
    const incoming = right.entries[key];
    if (!incoming || incoming.fingerprint !== left.entries[key].fingerprint) {
      return false;
    }
  }
  return true;
}

export function formatDiary(brief: DiaryBrief): string {
  if (brief.recent.length === 0) {
    return [
      'No session diary yet.',
      'When you finish, record one line of work, what went well, and what went wrong.',
    ].join('\n');
  }

  const lines = ['Session diary', ''];
  lines.push('Keep doing');
  lines.push(
    ...(brief.keep.length
      ? brief.keep.map((line) => `  - ${line}`)
      : ['  - none yet']),
  );
  lines.push('');
  lines.push('Stop doing');
  lines.push(
    ...(brief.stop.length
      ? brief.stop.map((line) => `  - ${line}`)
      : ['  - none yet']),
  );
  lines.push('');
  lines.push('Recent work');
  for (const entry of brief.recent) {
    const who = entry.agent ? `  ${entry.agent}` : '';
    lines.push(`  ${entry.createdAt.slice(0, 10)}${who}  ${entry.work}`);
  }
  return lines.join('\n');
}

export function formatDiaryList(entries: DiaryEntry[]): string {
  if (entries.length === 0) {
    return 'No session diary yet.';
  }
  const lines: string[] = [];
  for (const entry of entries) {
    const who = entry.agent ? `  ${entry.agent}` : '';
    lines.push(`${entry.id}  ${entry.createdAt.slice(0, 10)}${who}`);
    lines.push(`  ${entry.work}`);
    for (const line of entry.wentWell) {
      lines.push(`  well  ${line}`);
    }
    for (const line of entry.wentWrong) {
      lines.push(`  wrong  ${line}`);
    }
  }
  return lines.join('\n');
}
