import { withLepper } from '../../notes/session';
import { addTodo, completeTodo, listTodos, startTodo } from '../../todos/todos';
import { str, textResult } from '../params';
import { McpTool } from './types';

export const todoTool: McpTool = {
  name: 'todo',
  description:
    'Share work-in-progress with other agents on this repo. Actions: add, list, start, done.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'list', 'start', 'claim', 'done'],
        description: 'Todo action',
      },
      title: { type: 'string', description: 'Title for add' },
      body: { type: 'string', description: 'Optional details for add' },
      id: { type: 'string', description: 'Todo id for start or done' },
      status: {
        type: 'string',
        enum: ['open', 'doing', 'done'],
        description: 'Optional list filter',
      },
      agent: { type: 'string', description: 'Optional agent name' },
    },
    required: ['action'],
  },
  call(params, cwd) {
    const action = str(params, 'action') || 'list';
    const payload = withLepper(cwd, (store) => {
      if (action === 'add') {
        return addTodo(store, {
          title: str(params, 'title'),
          body: str(params, 'body') || undefined,
          agent: str(params, 'agent') || undefined,
        });
      }
      if (action === 'start' || action === 'claim') {
        return startTodo(
          store,
          str(params, 'id'),
          str(params, 'agent') || undefined,
        );
      }
      if (action === 'done') {
        return completeTodo(
          store,
          str(params, 'id'),
          str(params, 'agent') || undefined,
        );
      }
      return listTodos(
        store,
        str(params, 'status') as 'open' | 'doing' | 'done' | undefined,
      );
    });
    return textResult(payload);
  },
};
