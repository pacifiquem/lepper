import { KEYWORDS as JS_KEYWORDS } from './keywords';
import type {
  LangBinding,
  LangCall as CallFact,
  LangKind as SymbolKind,
  LangParse,
  LangSymbol as LocalSymbol,
} from '../shared/types';
import {
  lineAt,
  maskJs,
  readIdent,
  skipBalanced,
  skipWs,
  startsWithIdent,
  statementEnd,
} from '../shared/text';

type BindingMap = Map<string, LangBinding>;
type ExportFact = { publicName: string; localName: string };
type FileFacts = LangParse;

function parseNamedSpecifiers(
  clause: string,
): Array<{ local: string; imported: string }> {
  const body = clause.replace(/[{}]/g, ' ');
  const parts = body.split(',');
  const specs: Array<{ local: string; imported: string }> = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const alias = trimmed.match(
      /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/,
    );
    if (alias) {
      specs.push({ imported: alias[1], local: alias[2] });
      continue;
    }
    const ident = trimmed.match(/^([A-Za-z_$][\w$]*)$/);
    if (ident) {
      specs.push({ imported: ident[1], local: ident[1] });
    }
  }
  return specs;
}

function skipSignatureTail(source: string, index: number): number {
  let i = skipWs(source, index);
  if (source[i] !== ':') {
    return i;
  }
  i++;
  let angle = 0;
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '<') {
      angle++;
    } else if (c === '>') {
      angle = Math.max(0, angle - 1);
    } else if (c === '(') {
      paren++;
    } else if (c === ')') {
      paren = Math.max(0, paren - 1);
    } else if (c === '[') {
      bracket++;
    } else if (c === ']') {
      bracket = Math.max(0, bracket - 1);
    } else if (c === '{') {
      if (angle === 0 && paren === 0 && bracket === 0 && brace === 0) {
        return i;
      }
      brace++;
    } else if (c === '}') {
      brace = Math.max(0, brace - 1);
    } else if (
      source.startsWith('=>', i) &&
      angle === 0 &&
      paren === 0 &&
      brace === 0 &&
      bracket === 0
    ) {
      return i;
    }
    i++;
  }
  return i;
}

function isFunctionRhs(source: string, index: number): boolean {
  const j = skipWs(source, index);
  if (startsWithIdent(source, j, 'async')) {
    const k = skipWs(source, j + 'async'.length);
    if (startsWithIdent(source, k, 'function') || source[k] === '(') {
      return true;
    }
    const ident = readIdent(source, k);
    if (!ident) {
      return false;
    }
    return source.startsWith('=>', skipWs(source, ident.end));
  }
  if (startsWithIdent(source, j, 'function')) {
    return true;
  }
  if (source[j] === '(') {
    const end = skipBalanced(source, j, '(', ')');
    const tail = skipSignatureTail(source, end);
    return source.startsWith('=>', tail);
  }
  const ident = readIdent(source, j);
  if (!ident) {
    return false;
  }
  return source.startsWith('=>', skipWs(source, ident.end));
}

function findFunctionBody(
  source: string,
  index: number,
): { start: number; end: number } {
  let j = skipWs(source, index);
  if (startsWithIdent(source, j, 'async')) {
    j = skipWs(source, j + 'async'.length);
  }
  if (startsWithIdent(source, j, 'function')) {
    j = skipWs(source, j + 'function'.length);
    const name = readIdent(source, j);
    if (name) {
      j = name.end;
    }
    j = skipWs(source, j);
    if (source[j] === '<') {
      j = skipBalanced(source, j, '<', '>');
      j = skipWs(source, j);
    }
    if (source[j] === '(') {
      j = skipBalanced(source, j, '(', ')');
    }
    j = skipSignatureTail(source, j);
    if (source[j] === '{') {
      return { start: j, end: skipBalanced(source, j, '{', '}') };
    }
  }
  const arrow = source.indexOf('=>', j);
  if (arrow === -1) {
    return { start: index, end: index };
  }
  j = skipWs(source, arrow + 2);
  if (source[j] === '{') {
    return { start: j, end: skipBalanced(source, j, '{', '}') };
  }
  return { start: j, end: statementEnd(source, j) };
}

export function parseJs(
  original: string,
  keywords: Set<string> = new Set(JS_KEYWORDS),
): LangParse {
  const masked = maskJs(original);
  const symbols: LocalSymbol[] = [];
  const calls: CallFact[] = [];
  const bindings: BindingMap = new Map();
  const exports: ExportFact[] = [];
  const imports: FileFacts['imports'] = [];
  collectJsModules(original, bindings, exports, imports);
  let pendingExport = false;
  let pendingDefault = false;
  let i = 0;

  const pushSymbol = (
    name: string,
    kind: SymbolKind,
    bodyStart: number,
    bodyEnd: number,
    index: number,
  ) => {
    const exported = pendingExport || pendingDefault;
    const qualified = pendingDefault ? 'default' : name;
    symbols.push({
      name,
      qualified: kind === 'method' ? name : qualified,
      kind,
      line: lineAt(masked, index),
      exported,
      bodyStart,
      bodyEnd,
    });
    if (exported) {
      exports.push({
        publicName: pendingDefault ? 'default' : name,
        localName: name,
      });
    }
    pendingExport = false;
    pendingDefault = false;
  };

  while (i < masked.length) {
    if (/\s/.test(masked[i])) {
      i++;
      continue;
    }
    const ident = readIdent(masked, i);
    if (!ident) {
      i++;
      continue;
    }

    if (ident.name === 'import') {
      const end = statementEnd(masked, i);
      pendingExport = false;
      pendingDefault = false;
      i = end;
      continue;
    }

    if (ident.name === 'export') {
      const after = skipWs(masked, ident.end);
      if (masked[after] === '{') {
        const end = statementEnd(masked, i);
        pendingExport = false;
        pendingDefault = false;
        i = end;
        continue;
      }
      const next = readIdent(masked, after);
      pendingExport = true;
      if (next?.name === 'default') {
        pendingDefault = true;
        i = next.end;
        continue;
      }
      if (next?.name === 'type') {
        pendingExport = false;
        i = next.end;
        continue;
      }
      i = ident.end;
      continue;
    }

    if (ident.name === 'function') {
      const after = skipWs(masked, ident.end);
      const name = readIdent(masked, after);
      if (!name || keywords.has(name.name)) {
        pendingExport = false;
        pendingDefault = false;
        i = ident.end;
        continue;
      }
      const body = findFunctionBody(masked, i);
      pushSymbol(
        name.name,
        'function',
        body.start,
        body.end,
        name.end - name.name.length,
      );
      i = name.end;
      continue;
    }

    if (ident.name === 'class') {
      const after = skipWs(masked, ident.end);
      const name = readIdent(masked, after);
      if (!name) {
        i = ident.end;
        continue;
      }
      let brace = name.end;
      while (brace < masked.length && masked[brace] !== '{') {
        brace++;
      }
      const bodyEnd =
        brace < masked.length
          ? skipBalanced(masked, brace, '{', '}')
          : masked.length;
      pushSymbol(
        name.name,
        'class',
        brace,
        bodyEnd,
        name.end - name.name.length,
      );
      i = name.end;
      continue;
    }

    if (
      ident.name === 'const' ||
      ident.name === 'let' ||
      ident.name === 'var'
    ) {
      const after = skipWs(masked, ident.end);
      if (masked[after] === '{') {
        const end = statementEnd(masked, i);
        pendingExport = false;
        pendingDefault = false;
        i = end;
        continue;
      }
      const name = readIdent(masked, after);
      if (!name) {
        i = ident.end;
        continue;
      }
      const afterName = skipWs(masked, name.end);
      if (masked[afterName] === '=') {
        const rhs = skipWs(masked, afterName + 1);
        if (isFunctionRhs(masked, rhs)) {
          const body = findFunctionBody(masked, rhs);
          pushSymbol(
            name.name,
            'function',
            body.start,
            body.end,
            name.end - name.name.length,
          );
        } else {
          pendingExport = false;
          pendingDefault = false;
        }
      } else {
        pendingExport = false;
        pendingDefault = false;
      }
      i = name.end;
      continue;
    }

    if (ident.name === 'async') {
      const after = skipWs(masked, ident.end);
      if (startsWithIdent(masked, after, 'function')) {
        i = after;
        continue;
      }
      i = ident.end;
      continue;
    }

    const after = skipWs(masked, ident.end);
    if (masked[after] === '(' && !keywords.has(ident.name)) {
      const afterParen = skipBalanced(masked, after, '(', ')');
      const afterSpace = skipSignatureTail(masked, afterParen);
      if (masked[afterSpace] === '{') {
        const bodyEnd = skipBalanced(masked, afterSpace, '{', '}');
        pushSymbol(
          ident.name,
          'method',
          afterSpace,
          bodyEnd,
          ident.end - ident.name.length,
        );
        i = afterParen;
        continue;
      }
      calls.push({
        name: ident.name,
        index: ident.end - ident.name.length,
        line: lineAt(masked, ident.end),
      });
      i = ident.end;
      continue;
    }

    if (masked[after] === '.') {
      const memberAt = skipWs(masked, after + 1);
      const member = readIdent(masked, memberAt);
      if (member) {
        const afterMember = skipWs(masked, member.end);
        if (masked[afterMember] === '(' && !keywords.has(member.name)) {
          calls.push({
            name: member.name,
            qualifier: ident.name,
            index: member.end - member.name.length,
            line: lineAt(masked, member.end),
          });
          i = member.end;
          continue;
        }
      }
    }

    if (ident.name !== 'from' && ident.name !== 'as') {
      pendingExport = false;
      pendingDefault = false;
    }
    i = ident.end;
  }

  applyCommonJsExports(masked, symbols, exports);
  qualifyMethods(symbols);
  return { symbols, calls, bindings, exports, imports };
}

function collectJsModules(
  source: string,
  bindings: BindingMap,
  exports: ExportFact[],
  imports: FileFacts['imports'],
): void {
  const importFrom =
    /(^|[;\n])([ \t]*)import\s+([\s\S]*?)\s+from\s*(['"])([^'"]+)\4/g;
  let match: RegExpExecArray | null;
  while ((match = importFrom.exec(source))) {
    if (match[2].includes('//')) {
      continue;
    }
    parseJsImport(
      `import ${match[3]} from ${match[4]}${match[5]}${match[4]}`,
      lineAt(source, match.index),
      bindings,
      imports,
    );
  }

  const sideEffect = /(^|[;\n])([ \t]*)import\s+(['"])([^'"]+)\3/g;
  while ((match = sideEffect.exec(source))) {
    if (match[2].includes('//')) {
      continue;
    }
    const line = lineAt(source, match.index);
    if (
      !imports.some((item) => item.line === line && item.spec === match?.[4])
    ) {
      imports.push({ spec: match[4], line, names: [] });
    }
  }

  const exportFrom =
    /(^|[;\n])\s*export\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\3/g;
  while ((match = exportFrom.exec(source))) {
    parseJsExportList(
      `export {${match[2]}} from ${match[3]}${match[4]}${match[3]}`,
      lineAt(source, match.index),
      exports,
      imports,
    );
  }

  const exportLocal = /(^|[;\n])\s*export\s*\{([^}]*)\}/g;
  while ((match = exportLocal.exec(source))) {
    const slice = source.slice(match.index, match.index + match[0].length);
    if (/\bfrom\b/.test(slice)) {
      continue;
    }
    parseJsExportList(
      `export {${match[2]}}`,
      lineAt(source, match.index),
      exports,
      imports,
    );
  }

  const requireName =
    /(^|[;\n])\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*(['"])([^'"]+)\3\s*\)/g;
  while ((match = requireName.exec(source))) {
    const line = lineAt(source, match.index);
    bindings.set(match[2], { spec: match[4], imported: '*', line });
    imports.push({ spec: match[4], line, names: ['*'] });
  }

  const requireList =
    /(^|[;\n])\s*(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\s*\(\s*(['"])([^'"]+)\3\s*\)/g;
  while ((match = requireList.exec(source))) {
    parseJsRequireDestructure(
      `const {${match[2]}} = require(${match[3]}${match[4]}${match[3]})`,
      lineAt(source, match.index),
      bindings,
      imports,
    );
  }
}

function parseJsImport(
  statement: string,
  line: number,
  bindings: BindingMap,
  imports: FileFacts['imports'],
): void {
  const from = statement.match(/from\s+(['"])([^'"]+)\1/);
  const side = statement.match(/import\s+(['"])([^'"]+)\1/);
  const spec = from?.[2] || side?.[2];
  if (!spec) {
    return;
  }
  if (!from) {
    imports.push({ spec, line, names: [] });
    return;
  }
  const head = statement
    .slice(0, from.index)
    .replace(/^import\s+/, '')
    .trim();
  const names: string[] = [];
  if (head.startsWith('*')) {
    const alias = head.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (alias) {
      bindings.set(alias[1], { spec, imported: '*', line });
      names.push('*');
    }
  } else if (head.startsWith('{')) {
    for (const item of parseNamedSpecifiers(head)) {
      bindings.set(item.local, { spec, imported: item.imported, line });
      names.push(item.imported);
    }
  } else {
    const comma = head.indexOf(',');
    const defaultPart = (comma === -1 ? head : head.slice(0, comma)).trim();
    const def = defaultPart.match(/^([A-Za-z_$][\w$]*)/);
    if (def) {
      bindings.set(def[1], { spec, imported: 'default', line });
      names.push('default');
    }
    if (comma !== -1) {
      for (const item of parseNamedSpecifiers(head.slice(comma + 1))) {
        bindings.set(item.local, { spec, imported: item.imported, line });
        names.push(item.imported);
      }
    }
  }
  imports.push({ spec, line, names });
}

function parseJsExportList(
  statement: string,
  line: number,
  exports: ExportFact[],
  imports: FileFacts['imports'],
): void {
  const from = statement.match(/from\s+(['"])([^'"]+)\1/);
  const list = statement.match(/\{([^}]*)\}/);
  if (!list) {
    return;
  }
  for (const item of parseNamedSpecifiers(list[1])) {
    exports.push({
      publicName: item.local,
      localName: from ? item.local : item.imported,
    });
  }
  if (from) {
    imports.push({
      spec: from[2],
      line,
      names: parseNamedSpecifiers(list[1]).map((item) => item.imported),
    });
  }
}

function parseJsRequireDestructure(
  statement: string,
  line: number,
  bindings: BindingMap,
  imports: FileFacts['imports'],
): void {
  const specMatch = statement.match(/require\s*\(\s*(['"])([^'"]+)\1\s*\)/);
  if (!specMatch) {
    return;
  }
  const list = statement.match(/\{([^}]*)\}/);
  if (!list) {
    return;
  }
  const names: string[] = [];
  for (const item of parseNamedSpecifiers(list[1])) {
    bindings.set(item.local, {
      spec: specMatch[2],
      imported: item.imported,
      line,
    });
    names.push(item.imported);
  }
  imports.push({ spec: specMatch[2], line, names });
}

function applyCommonJsExports(
  masked: string,
  symbols: LocalSymbol[],
  exports: ExportFact[],
): void {
  const objectExport = /module\.exports\s*=\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = objectExport.exec(masked))) {
    for (const item of parseNamedSpecifiers(match[1].replace(/:[^,}]*/g, ''))) {
      exports.push({ publicName: item.local, localName: item.local });
      markExported(symbols, item.local);
    }
  }
  const named = /(?:^|[^\w$])exports\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((match = named.exec(masked))) {
    exports.push({ publicName: match[1], localName: match[1] });
    markExported(symbols, match[1]);
  }
  const assigned = /module\.exports\s*=\s*([A-Za-z_$][\w$]*)/g;
  while ((match = assigned.exec(masked))) {
    if (match[1] === 'exports') {
      continue;
    }
    exports.push({ publicName: 'default', localName: match[1] });
    exports.push({ publicName: match[1], localName: match[1] });
    markExported(symbols, match[1]);
  }
}

function markExported(symbols: LocalSymbol[], name: string): void {
  for (const symbol of symbols) {
    if (symbol.name === name) {
      symbol.exported = true;
    }
  }
}

function qualifyMethods(symbols: LocalSymbol[]): void {
  const classes = symbols.filter((symbol) => symbol.kind === 'class');
  for (let index = symbols.length - 1; index >= 0; index--) {
    const symbol = symbols[index];
    if (symbol.kind !== 'method') {
      continue;
    }
    const owner = classes.find(
      (klass) =>
        symbol.bodyStart >= klass.bodyStart && symbol.bodyEnd <= klass.bodyEnd,
    );
    if (owner) {
      symbol.qualified = `${owner.name}.${symbol.name}`;
      continue;
    }
    const insideFunction = symbols.some(
      (other) =>
        other.kind === 'function' &&
        symbol.bodyStart > other.bodyStart &&
        symbol.bodyEnd <= other.bodyEnd,
    );
    if (insideFunction) {
      symbols.splice(index, 1);
      continue;
    }
    symbol.kind = 'function';
    symbol.qualified = symbol.name;
  }
}

export const id = 'javascript';
export const extensions = ['.js', '.jsx', '.mjs', '.cjs'];
export { JS_KEYWORDS as KEYWORDS };

export function parse(source: string): LangParse {
  return parseJs(source);
}
