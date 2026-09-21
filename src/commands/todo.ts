import chalk from 'chalk';
import { withLepper } from '../lib/api';
import { CliError } from '../lib/errors';
import { Log } from '../lib/helper';
import { addTodo, completeTodo, listTodos, startTodo } from '../lib/todos';
import { TodoItem } from '../lib/types';
import { projectCwd } from '../lib/git';

export interface TodoOptions {
  action?: string;
  title?: string;
  id?: string;
  body?: string;
  status?: TodoItem['status'];
  agent?: string;
  cwd?: string;
  json?: boolean;
}

function printTodo(todo: TodoItem): void {
  Log(
    `${chalk.bold(todo.id)}  [${todo.status}]  ${todo.title}${
      todo.agent ? `  (${todo.agent})` : ''
    }`,
  );
  if (todo.body) {
    Log(chalk.dim(todo.body));
  }
}

const todoCommand = (options: TodoOptions): void => {
  const action = (options.action || 'list').toLowerCase();
  const cwd = projectCwd(options.cwd);

  const result = withLepper(cwd, (store) => {
    if (action === 'add') {
      if (!options.title?.trim()) {
        throw new CliError('todo add requires a title.');
      }
      return {
        kind: 'one' as const,
        todo: addTodo(store, {
          title: options.title,
          body: options.body,
          agent: options.agent,
        }),
      };
    }

    if (action === 'start' || action === 'claim') {
      if (!options.id) {
        throw new CliError('todo start requires an id.');
      }
      return {
        kind: 'one' as const,
        todo: startTodo(store, options.id, options.agent),
      };
    }

    if (action === 'done') {
      if (!options.id) {
        throw new CliError('todo done requires an id.');
      }
      return {
        kind: 'one' as const,
        todo: completeTodo(store, options.id, options.agent),
      };
    }

    if (action === 'list') {
      return {
        kind: 'list' as const,
        todos: listTodos(store, options.status),
      };
    }

    throw new CliError(
      `Unknown todo action "${action}". Use add, list, start, or done.`,
    );
  });

  if (options.json) {
    Log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.kind === 'one') {
    printTodo(result.todo);
    return;
  }

  if (result.todos.length === 0) {
    Log(chalk.yellow('No todos.'));
    return;
  }

  for (const todo of result.todos) {
    printTodo(todo);
  }
};

export default todoCommand;
