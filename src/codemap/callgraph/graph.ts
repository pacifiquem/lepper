import path from 'path';
import { CliError } from '../../utils/errors';
import { supportedExtensions } from '../languages/registry';
import { moduleFiles } from '../languages/shared/modules';
import { normalizeProjectPath } from '../../utils/paths';
import { withCachedFacts } from './cache';
import { collectSourceFiles } from './scan';
import type {
  CallSite,
  CodeMap,
  CodeSymbol,
  Confidence,
  CallFact,
  FileFacts,
  Graph,
  LocalSymbol,
  ResolvedEdge,
} from './types';

export function mapValues<K, V>(map: Map<K, V>): V[] {
  const values: V[] = [];
  map.forEach((value) => {
    values.push(value);
  });
  return values;
}

export function resolvePythonModule(
  fromFile: string,
  spec: string,
  known: Set<string>,
): string | null {
  let dots = 0;
  while (spec[dots] === '.') {
    dots++;
  }
  let dir = path.posix.dirname(fromFile);
  for (let up = 1; up < dots; up++) {
    dir = path.posix.dirname(dir);
  }
  const rest = spec.slice(dots).replace(/\./g, '/');
  const base = rest ? path.posix.join(dir, rest) : dir;
  const stem = `./${base.replace(/^\.\//, '')}`;
  for (const ext of ['.py', '.pyi']) {
    if (known.has(`${stem}${ext}`)) {
      return `${stem}${ext}`;
    }
  }
  return firstExisting(base, known);
}

export function resolveSpecifier(
  fromFile: string,
  spec: string,
  known: Set<string>,
): string | null {
  if (/^\.+[^/]/.test(spec) || spec === '.') {
    return resolvePythonModule(fromFile, spec, known);
  }
  if (!spec.startsWith('.')) {
    const bare = spec.replace(/^\.+/, '');
    const local = path.posix.join(path.posix.dirname(fromFile), bare);
    const sibling = firstExisting(local, known);
    if (sibling) {
      return sibling;
    }
    return null;
  }
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromFile), spec),
  );
  const relative = firstExisting(base, known);
  if (relative) {
    return relative;
  }
  return null;
}

export function firstExisting(base: string, known: Set<string>): string | null {
  const trimmed = base.replace(/^\.\//, '');
  const candidates = [
    trimmed,
    ...[
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.py',
      '.pyi',
      ...supportedExtensions,
    ].map((ext) => `${trimmed}${ext}`),
    ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'].map(
      (ext) => `${trimmed}/index${ext}`,
    ),
  ];
  for (const candidate of candidates) {
    const withDot = candidate.startsWith('.') ? candidate : `./${candidate}`;
    if (known.has(withDot)) {
      return withDot;
    }
  }
  return null;
}

export function isNestedSymbol(
  symbol: LocalSymbol,
  symbols: LocalSymbol[],
): boolean {
  return symbols.some(
    (other) =>
      other !== symbol &&
      other.kind !== 'module' &&
      symbol.bodyStart > other.bodyStart &&
      symbol.bodyEnd <= other.bodyEnd,
  );
}

export function ownerOf(
  symbols: LocalSymbol[],
  index: number,
): LocalSymbol | null {
  let best: LocalSymbol | null = null;
  for (const symbol of symbols) {
    if (symbol.kind === 'class') {
      continue;
    }
    if (index >= symbol.bodyStart && index < symbol.bodyEnd) {
      if (
        !best ||
        symbol.bodyEnd - symbol.bodyStart < best.bodyEnd - best.bodyStart
      ) {
        best = symbol;
      }
    }
  }
  return best;
}

export function symbolId(filePath: string, symbol: LocalSymbol): string {
  return `${filePath}#${symbol.qualified}#${symbol.line}`;
}

export function buildGraph(root: string): Graph {
  const collected = collectSourceFiles(root);
  return withCachedFacts(root, collected, (facts) =>
    assembleGraph(collected, facts),
  );
}

function assembleGraph(
  collected: { files: string[]; truncated: boolean },
  facts: FileFacts[],
): Graph {
  const known = new Set(collected.files);

  const symbols = new Map<string, CodeSymbol>();
  const byFile = new Map<string, string[]>();
  const localIds = new Map<string, string>();

  for (const file of facts) {
    const moduleSymbol: LocalSymbol = {
      name: '(top)',
      qualified: '(top)',
      kind: 'module',
      line: 1,
      exported: false,
      bodyStart: 0,
      bodyEnd: Number.MAX_SAFE_INTEGER,
    };
    const ids: string[] = [];
    for (const symbol of file.symbols) {
      const id = symbolId(file.path, symbol);
      localIds.set(`${file.path}:${symbol.bodyStart}:${symbol.name}`, id);
      ids.push(id);
      symbols.set(id, {
        id,
        path: file.path,
        name: symbol.name,
        qualified: symbol.qualified,
        kind: symbol.kind,
        line: symbol.line,
        exported: symbol.exported,
        calls: [],
        calledBy: [],
      });
    }
    const topId = `${file.path}#(top)#1`;
    ids.push(topId);
    symbols.set(topId, {
      id: topId,
      path: file.path,
      name: '(top)',
      qualified: '(top)',
      kind: 'module',
      line: 1,
      exported: false,
      calls: [],
      calledBy: [],
    });
    localIds.set(`${file.path}:top`, topId);
    file.symbols.push(moduleSymbol);
    byFile.set(file.path, ids);
  }

  const exportsByFile = new Map<string, Map<string, string[]>>();
  for (const file of facts) {
    const table = new Map<string, string[]>();
    for (const item of file.exports) {
      const named = file.symbols.filter(
        (symbol) => symbol.name === item.localName,
      );
      const topLevel = named.filter(
        (symbol) => !isNestedSymbol(symbol, file.symbols),
      );
      const targets = topLevel.length ? topLevel : named;
      const ids = targets.map((symbol) => symbolId(file.path, symbol));
      const existing = table.get(item.publicName) || [];
      const merged = existing.slice();
      for (const id of ids) {
        if (!merged.includes(id)) {
          merged.push(id);
        }
      }
      table.set(item.publicName, merged);
    }
    exportsByFile.set(file.path, table);
  }

  const edges: ResolvedEdge[] = [];
  const importLinks: Graph['imports'] = [];

  for (const file of facts) {
    for (const item of file.imports) {
      const targets = resolveTargets(file.path, item.spec, known);
      for (const target of targets) {
        importLinks.push({
          fromFile: file.path,
          toFile: target,
          line: item.line,
          names: item.names,
        });
      }
    }

    for (const call of file.calls) {
      const definedHere = file.symbols.some(
        (symbol) =>
          symbol.name === call.name &&
          symbol.line === call.line &&
          call.index < symbol.bodyStart,
      );
      if (definedHere) {
        continue;
      }
      const owner = ownerOf(file.symbols, call.index);
      const fromId = owner
        ? symbolId(file.path, owner)
        : `${file.path}#(top)#1`;
      const resolved = resolveCall(file, call, facts, known, exportsByFile);
      for (const target of resolved) {
        if (target.id === fromId) {
          continue;
        }
        edges.push({
          from: fromId,
          to: target.id,
          line: call.line,
          confidence: target.confidence,
        });
      }
    }
  }

  const seen = new Set<string>();
  const uniqueEdges = edges.filter((edge) => {
    const key = `${edge.from}->${edge.to}:${edge.line}:${edge.confidence}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return symbols.has(edge.from) && symbols.has(edge.to);
  });

  for (const edge of uniqueEdges) {
    const from = symbols.get(edge.from);
    const to = symbols.get(edge.to);
    if (!from || !to) {
      continue;
    }
    from.calls.push({
      name: to.qualified,
      path: to.path,
      line: to.line,
      confidence: edge.confidence,
    });
    to.calledBy.push({
      name: from.qualified,
      path: from.path,
      line: from.line,
      confidence: edge.confidence,
    });
  }

  return {
    filesScanned: facts.length,
    truncated: collected.truncated,
    symbols,
    edges: uniqueEdges,
    imports: importLinks,
    byFile,
  };
}

export function preferCallerLanguage(
  files: string[],
  fromFile: string,
): string[] {
  const ext = path.extname(fromFile).toLowerCase();
  const same = files.filter((file) => path.extname(file).toLowerCase() === ext);
  return same.length ? same : files;
}

export function resolveTargets(
  fromFile: string,
  spec: string,
  known: Set<string>,
): string[] {
  const direct = resolveSpecifier(fromFile, spec, known);
  if (direct) {
    const expanded = moduleFiles(direct.replace(/^\.\//, ''), known);
    if (direct && !expanded.includes(direct)) {
      expanded.unshift(direct);
    }
    return expanded.length ? expanded : [direct];
  }
  return preferCallerLanguage(moduleFiles(spec, known), fromFile);
}

export function preferImplementations(ids: string[]): string[] {
  const code = ids.filter((id) => {
    const file = id.split('#')[0];
    return !/\.(h|hpp|hh|hxx)$/.test(file);
  });
  return code.length > 0 && code.length < ids.length ? code : ids;
}

export function exportsNamed(
  files: string[],
  name: string,
  exportsByFile: Map<string, Map<string, string[]>>,
): string[] {
  const ids: string[] = [];
  for (const file of files) {
    const found = exportsByFile.get(file)?.get(name) || [];
    for (const id of found) {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  return preferImplementations(ids);
}

export function starImportIds(
  file: FileFacts,
  name: string,
  known: Set<string>,
  exportsByFile: Map<string, Map<string, string[]>>,
): string[] {
  const bound = new Set<string>();
  file.bindings.forEach((binding) => {
    bound.add(binding.spec);
  });
  const ids: string[] = [];
  for (const item of file.imports) {
    if (!item.names.includes('*') || bound.has(item.spec)) {
      continue;
    }
    const found = exportsNamed(
      resolveTargets(file.path, item.spec, known),
      name,
      exportsByFile,
    );
    for (const id of found) {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  return ids;
}

export function resolveCall(
  file: FileFacts,
  call: CallFact,
  facts: FileFacts[],
  known: Set<string>,
  exportsByFile: Map<string, Map<string, string[]>>,
): Array<{ id: string; confidence: Confidence }> {
  if (call.qualifier) {
    const binding = file.bindings.get(call.qualifier);
    if (
      binding &&
      (binding.imported === '*' || binding.imported === 'default')
    ) {
      const ids = exportsNamed(
        resolveTargets(file.path, binding.spec, known),
        call.name,
        exportsByFile,
      );
      if (ids.length) {
        return ids.map((id) => ({ id, confidence: 'resolved' as const }));
      }
    }
    const ids = exportsNamed(
      preferCallerLanguage(moduleFiles(call.qualifier, known), file.path),
      call.name,
      exportsByFile,
    );
    if (ids.length === 1) {
      return [{ id: ids[0], confidence: 'inferred' }];
    }
    if (ids.length > 1) {
      return ids.map((id) => ({ id, confidence: 'ambiguous' as const }));
    }
    return [];
  }

  const locals = file.symbols.filter(
    (symbol) =>
      symbol.kind !== 'module' &&
      symbol.kind !== 'class' &&
      (symbol.name === call.name || symbol.qualified === call.name) &&
      symbol.bodyStart !== call.index,
  );
  if (locals.length === 1) {
    return [{ id: symbolId(file.path, locals[0]), confidence: 'resolved' }];
  }
  if (locals.length > 1) {
    return locals.map((symbol) => ({
      id: symbolId(file.path, symbol),
      confidence: 'ambiguous' as const,
    }));
  }

  const binding = file.bindings.get(call.name);
  if (binding && binding.imported !== '*') {
    const ids = exportsNamed(
      resolveTargets(file.path, binding.spec, known),
      binding.imported,
      exportsByFile,
    );
    if (ids.length) {
      return ids.map((id) => ({ id, confidence: 'resolved' as const }));
    }
  }

  const starIds = starImportIds(file, call.name, known, exportsByFile);
  if (starIds.length === 1) {
    return [{ id: starIds[0], confidence: 'resolved' }];
  }
  if (starIds.length > 1) {
    return starIds.map((id) => ({ id, confidence: 'ambiguous' as const }));
  }

  if (file.path.endsWith('.go')) {
    const directoryHits = facts.flatMap((other) =>
      path.posix.dirname(other.path) === path.posix.dirname(file.path)
        ? other.symbols
            .filter(
              (symbol) =>
                symbol.name === call.name &&
                symbol.kind !== 'module' &&
                symbol.kind !== 'class' &&
                other.path !== file.path,
            )
            .map((symbol) => symbolId(other.path, symbol))
        : [],
    );
    if (directoryHits.length === 1) {
      return [{ id: directoryHits[0], confidence: 'resolved' }];
    }
    if (directoryHits.length > 1) {
      return directoryHits.map((id) => ({
        id,
        confidence: 'ambiguous' as const,
      }));
    }
  }

  const projectHits: string[] = [];
  for (const other of facts) {
    for (const symbol of other.symbols) {
      if (symbol.kind === 'module' || symbol.kind === 'class') {
        continue;
      }
      if (symbol.name === call.name) {
        projectHits.push(symbolId(other.path, symbol));
      }
    }
  }
  if (projectHits.length === 1) {
    return [{ id: projectHits[0], confidence: 'inferred' }];
  }
  if (projectHits.length > 1) {
    return projectHits.map((id) => ({ id, confidence: 'ambiguous' as const }));
  }
  return [];
}

export function focusPath(
  root: string,
  input: string | undefined,
): string | undefined {
  if (!input || !input.trim()) {
    return undefined;
  }
  const normalized = normalizeProjectPath(input, root);
  if (normalized.startsWith('..')) {
    throw new CliError(`Path is outside the project: ${input}`);
  }
  return normalized;
}

export function matchesPath(
  symbolPath: string,
  prefix: string | undefined,
): boolean {
  if (!prefix || prefix === '.') {
    return true;
  }
  return symbolPath === prefix || symbolPath.startsWith(`${prefix}/`);
}

export function codeMap(
  root: string,
  options: { path?: string; symbol?: string } = {},
): CodeMap {
  const graph = buildGraph(root);
  const prefix = focusPath(root, options.path);
  const symbol = options.symbol?.trim();
  const symbols = mapValues(graph.symbols).filter((item) => {
    if (item.kind === 'module') {
      return false;
    }
    if (!matchesPath(item.path, prefix)) {
      return false;
    }
    if (!symbol) {
      return true;
    }
    return item.name === symbol || item.qualified === symbol;
  });
  symbols.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
  return {
    filesScanned: graph.filesScanned,
    truncated: graph.truncated,
    symbols,
  };
}

export function formatCodeMap(map: CodeMap): string {
  if (map.symbols.length === 0) {
    return map.filesScanned === 0
      ? 'No source files found.'
      : 'No symbols matched.';
  }
  const lines = [
    `Code map  ${map.filesScanned} files  ${map.symbols.length} symbols${
      map.truncated ? '  (truncated)' : ''
    }`,
  ];
  let current = '';
  for (const symbol of map.symbols) {
    if (symbol.path !== current) {
      current = symbol.path;
      lines.push('');
      lines.push(current);
    }
    const calls = summarizeSites(symbol.calls);
    const callers = summarizeSites(symbol.calledBy);
    const flags = [
      symbol.exported ? 'exported' : '',
      symbol.kind === 'method' ? 'method' : '',
      symbol.kind === 'class' ? 'class' : '',
    ]
      .filter(Boolean)
      .join(' ');
    lines.push(
      `  ${symbol.qualified}:${symbol.line}${flags ? `  ${flags}` : ''}`,
    );
    lines.push(`    calls ${calls}`);
    lines.push(`    called by ${callers}`);
  }
  return lines.join('\n');
}

export function summarizeSites(sites: CallSite[]): string {
  if (sites.length === 0) {
    return 'none';
  }
  const unique: string[] = [];
  for (const site of sites) {
    const label = `${site.path}#${site.name}:${site.line}${
      site.confidence === 'resolved' ? '' : ` ${site.confidence}`
    }`;
    if (!unique.includes(label)) {
      unique.push(label);
    }
  }
  return unique.join(', ');
}
