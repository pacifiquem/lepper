import fs from 'fs';
import path from 'path';
import { CliError, NOT_INITIALIZED } from './errors';
import { normalizeDirectoryMap } from './paths';

export interface LepperInfo {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  directories: Record<string, string>;
}

export function getLepperDir(cwd: string = process.cwd()): string {
  return path.join(cwd, '.lepper');
}

export function getInfoPath(cwd: string = process.cwd()): string {
  return path.join(getLepperDir(cwd), '_info.json');
}

export function isInitialized(cwd: string = process.cwd()): boolean {
  const infoPath = getInfoPath(cwd);
  if (!fs.existsSync(infoPath) || !fs.statSync(infoPath).isFile()) {
    return false;
  }

  return fs.readFileSync(infoPath, 'utf-8').trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value);
}

function asInfo(data: unknown, cwd: string): LepperInfo {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new CliError(
      'Failed to read .lepper/_info.json: expected a JSON object.',
    );
  }

  const record = data as Record<string, unknown>;
  const directories = record.directories;

  let rawDirectories: Record<string, string> = {};

  if (directories === undefined || directories === null) {
    rawDirectories = {};
  } else if (typeof directories === 'object' && !Array.isArray(directories)) {
    for (const [key, value] of Object.entries(
      directories as Record<string, unknown>,
    )) {
      rawDirectories[key] = value == null ? '' : String(value);
    }
  } else {
    throw new CliError(
      'Failed to read .lepper/_info.json: "directories" must be an object.',
    );
  }

  return {
    name: optionalString(record.name),
    description: optionalString(record.description),
    version: optionalString(record.version),
    author: optionalString(record.author),
    directories: normalizeDirectoryMap(rawDirectories, cwd),
  };
}

export function readInfo(cwd: string = process.cwd()): LepperInfo {
  const lepperDir = getLepperDir(cwd);
  const infoPath = getInfoPath(cwd);

  if (!fs.existsSync(lepperDir) || !fs.existsSync(infoPath)) {
    throw new CliError(NOT_INITIALIZED);
  }

  const raw = fs.readFileSync(infoPath, 'utf-8');
  if (raw.trim() === '') {
    throw new CliError('Failed to read .lepper/_info.json: file is empty.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliError(`Failed to read .lepper/_info.json: ${detail}`);
  }

  return asInfo(parsed, cwd);
}

export function writeInfo(cwd: string, info: LepperInfo): void {
  const lepperDir = getLepperDir(cwd);
  const infoPath = getInfoPath(cwd);

  fs.mkdirSync(lepperDir, { recursive: true });

  const payload: LepperInfo = {
    ...info,
    directories: normalizeDirectoryMap(info.directories || {}, cwd),
  };

  const tmpPath = `${infoPath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmpPath, infoPath);
}

export function createProjectInfo(answers: {
  name?: unknown;
  description?: unknown;
  version?: unknown;
  author?: unknown;
}): LepperInfo {
  return {
    name: optionalString(answers.name) ?? '',
    description: optionalString(answers.description) ?? '',
    version: optionalString(answers.version) ?? '',
    author: optionalString(answers.author) ?? '',
    directories: {},
  };
}
