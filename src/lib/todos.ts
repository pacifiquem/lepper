import { CliError } from './errors';
import { fingerprint, shortFingerprint } from './fingerprint';
import { readTodos, Store, writeTodos } from './store';
import { TodoItem } from './types';

export interface TodoInput {
  title: string;
  body?: string;
  agent?: string;
}

function agentOf(input?: string): string | undefined {
  return input?.trim() || process.env.LEPPER_AGENT || undefined;
}

export function addTodo(store: Store, input: TodoInput): TodoItem {
  const title = input.title.trim();
  if (!title) {
    throw new CliError('Todo title cannot be empty.');
  }

  const createdAt = new Date().toISOString();
  const payload = {
    title,
    body: input.body?.trim() || '',
    status: 'open',
    createdAt,
    agent: agentOf(input.agent) || null,
  };
  const fp = fingerprint(payload);
  const todo: TodoItem = {
    id: `todo-${shortFingerprint(fp, 8)}`,
    fingerprint: fp,
    title,
    body: input.body?.trim() || '',
    status: 'open',
    parent: null,
    createdAt,
    updatedAt: createdAt,
    agent: agentOf(input.agent),
  };

  const index = readTodos(store);
  index.todos[todo.id] = todo;
  writeTodos(store, index);
  return todo;
}

function updateTodo(
  store: Store,
  id: string,
  change: Partial<Pick<TodoItem, 'status' | 'agent' | 'title' | 'body'>>,
): TodoItem {
  const index = readTodos(store);
  const current = index.todos[id];
  if (!current) {
    throw new CliError(`Unknown todo: ${id}`);
  }

  const updatedAt = new Date().toISOString();
  const nextPayload = {
    id: current.id,
    title: change.title ?? current.title,
    body: change.body ?? current.body,
    status: change.status ?? current.status,
    agent: change.agent ?? current.agent ?? null,
    parent: current.fingerprint,
    updatedAt,
  };

  const next: TodoItem = {
    ...current,
    ...change,
    fingerprint: fingerprint(nextPayload),
    parent: current.fingerprint,
    updatedAt,
  };

  index.todos[id] = next;
  writeTodos(store, index);
  return next;
}

export function listTodos(
  store: Store,
  status?: TodoItem['status'],
): TodoItem[] {
  return Object.values(readTodos(store).todos)
    .filter((todo) => (status ? todo.status === status : true))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function startTodo(store: Store, id: string, agent?: string): TodoItem {
  return updateTodo(store, id, {
    status: 'doing',
    agent: agentOf(agent),
  });
}

export function completeTodo(
  store: Store,
  id: string,
  agent?: string,
): TodoItem {
  return updateTodo(store, id, {
    status: 'done',
    agent: agentOf(agent),
  });
}
