import fs from 'fs';
import path from 'path';
import { CliError } from '../errors';
import { buildGraph, focusPath, mapValues, matchesPath } from './graph';
import { DEFAULT_DEPTH, MAX_DEPENDENTS, MAX_DEPTH } from './scan';
import type { BlastDependent, BlastRadius, ResolvedEdge } from './types';

interface Target {
  path?: string;
  name?: string;
  fileOnly: boolean;
}

export function parseTarget(root: string, target: string): Target {
  const trimmed = target.trim();
  if (!trimmed) {
    throw new CliError('blast requires a file, symbol, or path#symbol.');
  }
  const hash = trimmed.indexOf('#');
  if (hash !== -1) {
    return {
      path: focusPath(root, trimmed.slice(0, hash)),
      name: trimmed.slice(hash + 1).trim(),
      fileOnly: false,
    };
  }
  if (
    trimmed.includes('/') ||
    trimmed.includes('..') ||
    path.isAbsolute(trimmed) ||
    path.extname(trimmed)
  ) {
    return { path: focusPath(root, trimmed), fileOnly: true };
  }
  const asPath = focusPath(root, trimmed);
  if (asPath && fs.existsSync(path.join(root, asPath.replace(/^\.\//, '')))) {
    return { path: asPath, fileOnly: true };
  }
  return { name: trimmed, fileOnly: false };
}

export function blastRadius(
  root: string,
  target: string,
  depth = DEFAULT_DEPTH,
): BlastRadius {
  const hops = Number.isFinite(depth) ? Math.floor(depth) : DEFAULT_DEPTH;
  if (hops < 1 || hops > MAX_DEPTH) {
    throw new CliError(`depth must be between 1 and ${MAX_DEPTH}.`);
  }
  const parsed = parseTarget(root, target);
  const graph = buildGraph(root);
  const definitions = mapValues(graph.symbols).filter((symbol) => {
    if (symbol.kind === 'module') {
      return false;
    }
    if (parsed.path && !matchesPath(symbol.path, parsed.path)) {
      return false;
    }
    if (parsed.fileOnly) {
      return symbol.path === parsed.path;
    }
    if (!parsed.name) {
      return false;
    }
    return symbol.name === parsed.name || symbol.qualified === parsed.name;
  });

  const definitionIds = new Set(definitions.map((symbol) => symbol.id));
  const dependents: BlastDependent[] = [];
  const truncatedFlag = { value: false };

  const incoming = new Map<string, ResolvedEdge[]>();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.to) || [];
    list.push(edge);
    incoming.set(edge.to, list);
  }

  const queue: Array<{ id: string; depth: number; through: string }> = [];
  for (const symbol of definitions) {
    queue.push({ id: symbol.id, depth: 0, through: symbol.qualified });
  }
  const visited = new Set<string>(definitionIds);

  while (queue.length) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    if (current.depth >= hops) {
      continue;
    }
    for (const edge of incoming.get(current.id) || []) {
      if (visited.has(edge.from)) {
        continue;
      }
      visited.add(edge.from);
      const symbol = graph.symbols.get(edge.from);
      if (!symbol || symbol.kind === 'module') {
        continue;
      }
      if (dependents.length >= MAX_DEPENDENTS) {
        truncatedFlag.value = true;
        break;
      }
      const through = graph.symbols.get(current.id);
      dependents.push({
        path: symbol.path,
        name: symbol.qualified,
        line: symbol.line,
        depth: current.depth + 1,
        via: 'call',
        confidence: edge.confidence,
        through: through?.qualified || current.through,
      });
      queue.push({
        id: symbol.id,
        depth: current.depth + 1,
        through: symbol.qualified,
      });
    }
  }

  if (parsed.fileOnly && parsed.path) {
    const fileQueue: Array<{ file: string; depth: number }> = [
      { file: parsed.path, depth: 0 },
    ];
    const seenFiles = new Set<string>([parsed.path]);
    while (fileQueue.length) {
      const current = fileQueue.shift();
      if (!current || current.depth >= hops) {
        continue;
      }
      for (const link of graph.imports) {
        if (link.toFile !== current.file || seenFiles.has(link.fromFile)) {
          continue;
        }
        seenFiles.add(link.fromFile);
        if (dependents.length >= MAX_DEPENDENTS) {
          truncatedFlag.value = true;
          break;
        }
        dependents.push({
          path: link.fromFile,
          name: '(imports)',
          line: link.line,
          depth: current.depth + 1,
          via: 'import',
          confidence: 'resolved',
          through: link.toFile,
        });
        fileQueue.push({ file: link.fromFile, depth: current.depth + 1 });
      }
    }
  } else if (parsed.name) {
    for (const link of graph.imports) {
      const importsName =
        link.names.includes('*') ||
        link.names.includes('default') ||
        link.names.includes(parsed.name);
      const definesFile = definitions.some(
        (symbol) => symbol.path === link.toFile,
      );
      if (!importsName || !definesFile) {
        continue;
      }
      if (
        dependents.some(
          (item) => item.via === 'import' && item.path === link.fromFile,
        )
      ) {
        continue;
      }
      if (dependents.length >= MAX_DEPENDENTS) {
        truncatedFlag.value = true;
        break;
      }
      dependents.push({
        path: link.fromFile,
        name: '(imports)',
        line: link.line,
        depth: 1,
        via: 'import',
        confidence: 'resolved',
        through: parsed.name,
      });
    }
  }

  dependents.sort(
    (a, b) =>
      a.depth - b.depth || a.path.localeCompare(b.path) || a.line - b.line,
  );

  return {
    query: target,
    depth: hops,
    ambiguous: !parsed.fileOnly && definitions.length > 1,
    truncated: graph.truncated || truncatedFlag.value,
    definitions: definitions.map((symbol) => ({
      id: symbol.id,
      path: symbol.path,
      name: symbol.name,
      qualified: symbol.qualified,
      kind: symbol.kind,
      line: symbol.line,
    })),
    dependents,
  };
}

export function formatBlast(result: BlastRadius): string {
  const lines = [
    `Blast radius  ${result.query}`,
    `${result.definitions.length} definition${
      result.definitions.length === 1 ? '' : 's'
    }${result.ambiguous ? '  (name matches more than one symbol)' : ''}`,
  ];
  if (result.definitions.length === 0) {
    lines.push('Nothing in the code map matches that target.');
    return lines.join('\n');
  }
  for (const symbol of result.definitions) {
    lines.push(
      `  ${symbol.path}#${symbol.qualified}:${symbol.line}  ${symbol.kind}`,
    );
  }
  if (result.dependents.length === 0) {
    lines.push('');
    lines.push(
      'No dependents. Nothing else in the scanned source calls or imports it.',
    );
    return lines.join('\n');
  }
  lines.push('');
  lines.push(
    `Dependents (${result.dependents.length}${
      result.truncated ? ', truncated' : ''
    })`,
  );
  for (const item of result.dependents) {
    const confidence =
      item.confidence === 'resolved' ? '' : `  ${item.confidence}`;
    lines.push(
      `  d${item.depth}  ${item.via}  ${item.path}#${item.name}:${item.line}  via ${item.through}${confidence}`,
    );
  }
  return lines.join('\n');
}
