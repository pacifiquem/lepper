import * as c from './c/parser';
import * as cpp from './cpp/parser';
import * as csharp from './csharp/parser';
import * as css from './css/parser';
import * as elixir from './elixir/parser';
import * as erlang from './erlang/parser';
import * as go from './go/parser';
import * as html from './html/parser';
import * as java from './java/parser';
import * as javascript from './javascript/parser';
import * as powershell from './powershell/parser';
import * as python from './python/parser';
import * as rust from './rust/parser';
import * as shell from './shell/parser';
import * as sql from './sql/parser';
import * as typescript from './typescript/parser';
import type { LangParse } from './shared/types';

export interface LanguageModule {
  id: string;
  extensions: string[];
  KEYWORDS: readonly string[];
  parse: (source: string) => LangParse;
}

export const LANGUAGES: LanguageModule[] = [
  javascript,
  typescript,
  python,
  java,
  csharp,
  c,
  cpp,
  go,
  rust,
  shell,
  powershell,
  sql,
  elixir,
  erlang,
  html,
  css,
];

export const supportedExtensions: string[] = LANGUAGES.flatMap(
  (language) => language.extensions,
);

export function extensionOf(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  return dot === -1 ? '' : filePath.slice(dot).toLowerCase();
}

export function languageFor(filePath: string): LanguageModule | undefined {
  const ext = extensionOf(filePath);
  return LANGUAGES.find((language) => language.extensions.includes(ext));
}

export function keywordsForExtension(ext: string): string[] {
  const language = LANGUAGES.find((item) =>
    item.extensions.includes(ext.toLowerCase()),
  );
  if (!language) {
    return [];
  }
  return language.KEYWORDS.slice();
}

export function parseSource(
  filePath: string,
  source: string,
): LangParse | null {
  const language = languageFor(filePath);
  return language ? language.parse(source) : null;
}
