import {
  formatDiary,
  listDiary,
  recallDiary,
  writeDiaryEntry,
} from '../../diary/diary';
import { withLepper } from '../../notes/session';
import { linesOf, num, str, textResult } from '../params';
import { McpTool } from './types';

export const diaryTool: McpTool = {
  name: 'diary',
  description:
    'Cross-session diary shared by every agent on this repo. Call action recall at the start of a session and follow keep and stop. Call action write when you finish: one line of work, what the user liked, and what they did not want.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['recall', 'list', 'write'],
        description:
          'recall is the default and the one to use at session start',
      },
      work: {
        type: 'string',
        description: 'One line describing what this session worked on',
      },
      well: {
        type: 'array',
        items: { type: 'string' },
        description: 'What went well or what the user preferred',
      },
      wrong: {
        type: 'array',
        items: { type: 'string' },
        description: 'What went wrong or what the user did not want',
      },
      agent: { type: 'string', description: 'Optional agent name' },
      limit: {
        type: 'number',
        description: 'How many recent entries to read. Default 20.',
      },
    },
  },
  call(params, cwd) {
    const action = str(params, 'action') || 'recall';
    const payload = withLepper(cwd, (store) => {
      if (action === 'write' || action === 'add' || action === 'record') {
        return writeDiaryEntry(store, {
          work: str(params, 'work'),
          wentWell: linesOf(params, 'well'),
          wentWrong: linesOf(params, 'wrong'),
          agent: str(params, 'agent') || undefined,
        });
      }
      if (action === 'list') {
        return listDiary(store, num(params, 'limit') ?? 20);
      }
      const brief = recallDiary(store, num(params, 'limit') ?? 20);
      return {
        brief: formatDiary(brief),
        ...brief,
      };
    });
    return textResult(payload);
  },
};
