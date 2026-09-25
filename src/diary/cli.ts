import { withLepper } from '../notes/session';
import {
  formatDiary,
  formatDiaryList,
  listDiary,
  recallDiary,
  writeDiaryEntry,
} from './diary';
import { CliError } from '../utils/errors';
import { projectCwd } from '../utils/git';
import { Log } from '../utils/log';

export interface DiaryOptions {
  action?: string;
  work?: string;
  wentWell?: string[];
  wentWrong?: string[];
  agent?: string;
  limit?: number;
  cwd?: string;
  json?: boolean;
}

const diaryCommand = (options: DiaryOptions = {}): void => {
  const action = (options.action || 'recall').toLowerCase();
  const cwd = projectCwd(options.cwd);

  const result = withLepper(cwd, (store) => {
    if (action === 'write' || action === 'add' || action === 'record') {
      if (!options.work?.trim()) {
        throw new CliError('diary write requires --work.');
      }
      return {
        kind: 'entry' as const,
        entry: writeDiaryEntry(store, {
          work: options.work,
          wentWell: options.wentWell,
          wentWrong: options.wentWrong,
          agent: options.agent,
        }),
      };
    }

    if (action === 'list') {
      return {
        kind: 'list' as const,
        entries: listDiary(store, options.limit ?? 20),
      };
    }

    if (action === 'recall' || action === 'read') {
      return {
        kind: 'brief' as const,
        brief: recallDiary(store, options.limit ?? 20),
      };
    }

    throw new CliError(
      `Unknown diary action "${action}". Use recall, list, or write.`,
    );
  });

  if (options.json) {
    Log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.kind === 'entry') {
    Log(`Recorded ${result.entry.id}`);
    Log(result.entry.work);
    return;
  }

  if (result.kind === 'list') {
    Log(formatDiaryList(result.entries));
    return;
  }

  Log(formatDiary(result.brief));
};

export default diaryCommand;
