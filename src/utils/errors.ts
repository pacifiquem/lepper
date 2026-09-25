import chalk from 'chalk';
import { Log } from './log';

export class CliError extends Error {
  readonly exitCode: number;
  readonly alreadyPrinted: boolean;

  constructor(message: string, exitCode = 1, alreadyPrinted = false) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.alreadyPrinted = alreadyPrinted;
  }
}

export const NOT_INITIALIZED =
  'Lepper stores notes inside .git. Run this from a git repository.';

export function isCancelError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const name =
    'name' in error ? String((error as { name?: unknown }).name) : '';

  return name === 'ExitPromptError' || name === 'AbortPromptError';
}

export interface CliFailure {
  message: string;
  exitCode: number;
  alreadyPrinted: boolean;
}

export function formatCliFailure(error: unknown): CliFailure {
  if (error instanceof CliError) {
    return {
      message: error.message,
      exitCode: error.exitCode,
      alreadyPrinted: error.alreadyPrinted,
    };
  }

  if (isCancelError(error)) {
    return {
      message: 'Cancelled.',
      exitCode: 1,
      alreadyPrinted: false,
    };
  }

  if (error instanceof SyntaxError) {
    return {
      message: error.message,
      exitCode: 1,
      alreadyPrinted: false,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      exitCode: 1,
      alreadyPrinted: false,
    };
  }

  return {
    message: String(error),
    exitCode: 1,
    alreadyPrinted: false,
  };
}

export function handleError(error: unknown): never {
  const failure = formatCliFailure(error);

  if (!failure.alreadyPrinted && failure.message) {
    Log(chalk.red(failure.message));
  }

  process.exit(failure.exitCode);
}
