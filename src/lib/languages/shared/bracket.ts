import type { LangParse, Profile } from './types';
import {
  CONTROL,
  lineAt,
  maskSource,
  previousIdent,
  pushSymbol,
  readIdent,
  signatureKind,
  skipBalanced,
  skipWs,
  addImport,
  emptyParse,
} from './scan';

export function parseBracket(source: string, profile: Profile): LangParse {
  const masked = maskSource(source, profile.comments);
  const parsed = emptyParse();
  const keywords = new Set(profile.keywords);
  collectImports(source, profile.id, parsed);
  let i = 0;
  let depth = 0;
  while (i < masked.length) {
    if (masked[i] === '{') {
      depth++;
      i++;
      continue;
    }
    if (masked[i] === '}') {
      depth = Math.max(0, depth - 1);
      i++;
      continue;
    }
    if (/\s/.test(masked[i])) {
      i++;
      continue;
    }
    const ident = readIdent(masked, i);
    if (!ident) {
      i++;
      continue;
    }
    if (
      ident.name === 'class' ||
      ident.name === 'struct' ||
      ident.name === 'interface' ||
      ident.name === 'enum' ||
      ident.name === 'impl'
    ) {
      const nameAt = skipWs(masked, ident.end);
      const name = readIdent(masked, nameAt);
      if (name && !keywords.has(name.name)) {
        let brace = name.end;
        while (brace < masked.length && masked[brace] !== '{') {
          brace++;
        }
        const bodyEnd =
          brace < masked.length
            ? skipBalanced(masked, brace, '{', '}')
            : masked.length;
        pushSymbol(
          parsed,
          masked,
          name.name,
          'class',
          nameAt,
          brace,
          bodyEnd,
          true,
        );
      }
      i = ident.end;
      continue;
    }
    const after = skipWs(masked, ident.end);
    if (masked[after] !== '(') {
      i = ident.end;
      continue;
    }
    const parenEnd = skipBalanced(masked, after, '(', ')');
    const kind = signatureKind(masked, parenEnd);
    const prev = previousIdent(masked, ident.end - ident.name.length);
    const qualifiedCall = prev === '.';
    if (
      !keywords.has(ident.name) &&
      !CONTROL.has(ident.name) &&
      !qualifiedCall &&
      !CONTROL.has(prev) &&
      kind === 'def'
    ) {
      const brace = masked.indexOf('{', parenEnd);
      const bodyEnd =
        brace === -1 ? masked.length : skipBalanced(masked, brace, '{', '}');
      const owner = parsed.symbols.find(
        (symbol) =>
          symbol.kind === 'class' &&
          ident.end >= symbol.bodyStart &&
          ident.end < symbol.bodyEnd,
      );
      const qualified = owner ? `${owner.name}.${ident.name}` : ident.name;
      pushSymbol(
        parsed,
        masked,
        ident.name,
        owner ? 'method' : 'function',
        ident.end - ident.name.length,
        brace === -1 ? parenEnd : brace,
        bodyEnd,
        /^[A-Z]/.test(ident.name) ||
          profile.id === 'c' ||
          profile.id === 'cpp' ||
          profile.id === 'java' ||
          profile.id === 'csharp',
        qualified,
      );
      i = ident.end;
      continue;
    }
    const declaration = kind === 'decl' && depth === 0;
    if (!keywords.has(ident.name) && !CONTROL.has(ident.name) && !declaration) {
      const qualifier = qualifiedCall
        ? previousQualifier(masked, ident.end - ident.name.length)
        : undefined;
      parsed.calls.push({
        name: ident.name,
        qualifier,
        index: ident.end - ident.name.length,
        line: lineAt(masked, ident.end),
      });
    }
    i = ident.end;
  }
  if (profile.id === 'go' || profile.id === 'rust') {
    markExportedByCase(parsed, profile.id);
  }
  return parsed;
}

export function previousQualifier(
  source: string,
  index: number,
): string | undefined {
  let i = index - 1;
  while (i >= 0 && /\s/.test(source[i])) {
    i--;
  }
  if (source[i] === ':') {
    i--;
  }
  if (source[i] !== '.' && source[i] !== ':') {
    return undefined;
  }
  i--;
  while (i >= 0 && /\s/.test(source[i])) {
    i--;
  }
  const end = i + 1;
  while (i >= 0 && /[\w]/.test(source[i])) {
    i--;
  }
  const name = source.slice(i + 1, end);
  return name || undefined;
}

export function markExportedByCase(parsed: LangParse, lang: string): void {
  for (const symbol of parsed.symbols) {
    const exported = lang === 'rust' ? true : /^[A-Z]/.test(symbol.name);
    symbol.exported = exported;
    if (
      exported &&
      !parsed.exports.some((item) => item.localName === symbol.name)
    ) {
      parsed.exports.push({ publicName: symbol.name, localName: symbol.name });
    }
  }
}

export function collectImports(
  masked: string,
  lang: string,
  parsed: LangParse,
): void {
  let match: RegExpExecArray | null;
  if (lang === 'java') {
    const pattern = /import\s+(static\s+)?([\w.]+)\s*;/g;
    while ((match = pattern.exec(masked))) {
      const parts = match[2].split('.');
      const leaf = parts[parts.length - 1];
      const line = lineAt(masked, match.index);
      if (match[1]) {
        const typeName = parts[parts.length - 2] || leaf;
        addImport(parsed, parts.slice(0, -1).join('.'), line, [leaf], {
          local: leaf,
          imported: leaf,
        });
        addImport(parsed, parts.slice(0, -1).join('.'), line, ['*'], {
          local: typeName,
          imported: '*',
        });
      } else {
        addImport(parsed, match[2], line, ['*'], {
          local: leaf,
          imported: '*',
        });
      }
    }
  } else if (lang === 'csharp') {
    const pattern = /using\s+(static\s+)?([\w.]+)\s*;/g;
    while ((match = pattern.exec(masked))) {
      const line = lineAt(masked, match.index);
      const parts = match[2].split('.');
      if (match[1]) {
        addImport(parsed, match[2], line, ['*'], {
          local: parts[parts.length - 1],
          imported: '*',
        });
      } else {
        addImport(parsed, match[2], line, ['*']);
      }
    }
  } else if (lang === 'c' || lang === 'cpp') {
    const pattern = /#\s*include\s+"([^"]+)"/g;
    while ((match = pattern.exec(masked))) {
      addImport(parsed, match[1], lineAt(masked, match.index), ['*']);
    }
  } else if (lang === 'go') {
    const single = /import\s+(?:([A-Za-z_]\w*)\s+)?"([^"]+)"/g;
    while ((match = single.exec(masked))) {
      const spec = match[2];
      const leaf = spec.split('/').pop() || spec;
      const local = match[1] || leaf;
      addImport(parsed, spec, lineAt(masked, match.index), ['*'], {
        local,
        imported: '*',
      });
    }
  } else if (lang === 'rust') {
    const uses = /use\s+([\w:]+)(?:::\{([^}]+)\})?\s*;/g;
    while ((match = uses.exec(masked))) {
      const line = lineAt(masked, match.index);
      const path = match[1];
      if (match[2]) {
        for (const name of match[2].split(',')) {
          const leaf = name.trim();
          if (!leaf) {
            continue;
          }
          addImport(parsed, `${path}::${leaf}`, line, [leaf], {
            local: leaf,
            imported: leaf,
          });
        }
      } else {
        const segments = path.split('::');
        const leaf = segments[segments.length - 1] || path;
        const moduleSpec =
          segments.length > 1 ? segments.slice(0, -1).join('::') : path;
        addImport(parsed, moduleSpec, line, [leaf], {
          local: leaf,
          imported: leaf,
        });
      }
    }
    const mods = /(?:^|\n)\s*(?:pub\s+)?mod\s+([A-Za-z_]\w*)\s*;/g;
    while ((match = mods.exec(masked))) {
      addImport(parsed, match[1], lineAt(masked, match.index), ['*']);
    }
  }
}
