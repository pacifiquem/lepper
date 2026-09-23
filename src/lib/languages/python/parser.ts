import { KEYWORDS as PY_KEYWORDS } from './keywords';
import type {
  LangBinding,
  LangCall as CallFact,
  LangParse,
  LangSymbol as LocalSymbol,
} from '../shared/types';
import { lineAt, maskHashAndQuotes } from '../shared/text';

type BindingMap = Map<string, LangBinding>;
type ExportFact = { publicName: string; localName: string };
type FileFacts = LangParse;

export function parsePython(masked: string): LangParse {
  const symbols: LocalSymbol[] = [];
  const calls: CallFact[] = [];
  const bindings: BindingMap = new Map();
  const exports: ExportFact[] = [];
  const imports: FileFacts['imports'] = [];
  const lines = masked.split('\n');
  const lineStart: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    lineStart.push(cursor);
    cursor += line.length + 1;
  }

  const stack: Array<{ indent: number; index: number }> = [];
  lines.forEach((line, lineIndex) => {
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const trimmed = line.trim();
    const header = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/);
    const klass = trimmed.match(/^class\s+([A-Za-z_][\w]*)/);
    if (header || klass) {
      while (stack.length && indent <= stack[stack.length - 1].indent) {
        const previous = stack.pop();
        if (previous) {
          symbols[previous.index].bodyEnd = lineStart[lineIndex];
        }
      }
      const name = (header || klass)?.[1] || '';
      symbols.push({
        name,
        qualified: name,
        kind: klass ? 'class' : 'function',
        line: lineIndex + 1,
        exported: !name.startsWith('_'),
        bodyStart: lineStart[lineIndex],
        bodyEnd: masked.length,
      });
      if (!name.startsWith('_')) {
        exports.push({ publicName: name, localName: name });
      }
      stack.push({ indent, index: symbols.length - 1 });
    }

    const importFrom = trimmed.match(/^from\s+(\.*[\w.]*)\s+import\s+(.+)$/);
    if (importFrom) {
      const names: string[] = [];
      for (const item of parsePythonNames(importFrom[2])) {
        bindings.set(item.local, {
          spec: importFrom[1],
          imported: item.imported,
          line: lineIndex + 1,
        });
        names.push(item.imported);
      }
      imports.push({ spec: importFrom[1], line: lineIndex + 1, names });
    } else {
      const importMod = trimmed.match(/^import\s+(.+)$/);
      if (importMod) {
        const names: string[] = [];
        for (const item of parsePythonNames(importMod[1])) {
          bindings.set(item.local, {
            spec: item.imported,
            imported: '*',
            line: lineIndex + 1,
          });
          names.push('*');
        }
        imports.push({
          spec: importMod[1].split(',')[0].trim(),
          line: lineIndex + 1,
          names,
        });
      }
    }

    collectPatternCalls(
      line,
      lineStart[lineIndex],
      lineIndex + 1,
      new Set(PY_KEYWORDS),
      calls,
    );
  });

  return { symbols, calls, bindings, exports, imports };
}

function parsePythonNames(
  list: string,
): Array<{ local: string; imported: string }> {
  return list
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const alias = part.match(/^(\**[\w.]+)\s+as\s+([A-Za-z_][\w]*)$/);
      if (alias) {
        const imported = alias[1].split('.').pop() || alias[1];
        return { imported, local: alias[2] };
      }
      const imported = part.split('.').pop() || part;
      return { imported, local: imported };
    });
}

export function collectPatternCalls(
  chunk: string,
  baseIndex: number,
  baseLine: number,
  keywords: Set<string>,
  calls: CallFact[],
  absoluteLines = false,
): void {
  const qualified = /([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)\s*\(/g;
  const bare = /(^|[^.\w])([A-Za-z_][\w]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = qualified.exec(chunk))) {
    if (keywords.has(match[2])) {
      continue;
    }
    const index = baseIndex + match.index + match[1].length + 1;
    calls.push({
      name: match[2],
      qualifier: match[1],
      index,
      line: absoluteLines ? lineAt(chunk, match.index) : baseLine,
    });
  }
  while ((match = bare.exec(chunk))) {
    if (keywords.has(match[2])) {
      continue;
    }
    const index = baseIndex + match.index + match[1].length;
    calls.push({
      name: match[2],
      index,
      line: absoluteLines ? lineAt(chunk, index) : baseLine,
    });
  }
}

export const id = 'python';
export const extensions = ['.py', '.pyi'];
export { PY_KEYWORDS as KEYWORDS };

export function parse(source: string): LangParse {
  return parsePython(maskHashAndQuotes(source, true));
}
