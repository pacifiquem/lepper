import { buildGraph, focusPath } from '../codemap/callgraph/graph';
import type { Graph } from '../codemap/callgraph/types';
import { listRules } from './rules';
import type { Store } from '../utils/store';
import type { RuleItem } from '../utils/types';

const MAX_VIOLATIONS = 50;

export interface RuleViolation {
  via: 'import' | 'call';
  from: string;
  to: string;
  line: number;
  name: string;
}

export interface CheckedRule {
  id: string;
  from: string;
  to: string;
  note: string;
  violations: RuleViolation[];
}

export interface CheckReport {
  ok: boolean;
  checked: number;
  broken: number;
  truncated: boolean;
  rules: CheckedRule[];
}

function show(projectPath: string): string {
  return projectPath.replace(/^\.\//, '');
}

export function covers(prefix: string, filePath: string): boolean {
  const root = prefix.replace(/^\.\//, '');
  const file = filePath.replace(/^\.\//, '');
  if (root === '.' || root === '') {
    return true;
  }
  return file === root || file.startsWith(`${root}/`);
}

function crosses(rule: RuleItem, fromFile: string, toFile: string): boolean {
  if (fromFile === toFile) {
    return false;
  }
  return (
    covers(rule.from, fromFile) &&
    !covers(rule.to, fromFile) &&
    covers(rule.to, toFile)
  );
}

function collectViolations(
  graph: Graph,
  rules: RuleItem[],
  focus: string | undefined,
): { rules: CheckedRule[]; truncated: boolean } {
  const found: RuleViolation[][] = rules.map(() => []);
  const seen = new Set<string>();
  let truncated = false;

  const push = (ruleIndex: number, violation: RuleViolation): void => {
    if (focus && !covers(focus, violation.from)) {
      return;
    }
    const key = [
      rules[ruleIndex].id,
      violation.via,
      violation.from,
      violation.to,
      String(violation.line),
      violation.name,
    ].join('\0');
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    if (found[ruleIndex].length >= MAX_VIOLATIONS) {
      truncated = true;
      return;
    }
    found[ruleIndex].push(violation);
  };

  for (const link of graph.imports) {
    rules.forEach((rule, index) => {
      if (!crosses(rule, link.fromFile, link.toFile)) {
        return;
      }
      push(index, {
        via: 'import',
        from: show(link.fromFile),
        to: show(link.toFile),
        line: link.line,
        name: link.names.join(', ') || '(imports)',
      });
    });
  }

  for (const edge of graph.edges) {
    const source = graph.symbols.get(edge.from);
    const target = graph.symbols.get(edge.to);
    if (!source || !target) {
      continue;
    }
    rules.forEach((rule, index) => {
      if (!crosses(rule, source.path, target.path)) {
        return;
      }
      push(index, {
        via: 'call',
        from: show(source.path),
        to: show(target.path),
        line: edge.line,
        name: target.qualified,
      });
    });
  }

  return {
    truncated,
    rules: rules.map((rule, index) => ({
      id: rule.id,
      from: show(rule.from),
      to: show(rule.to),
      note: rule.note,
      violations: found[index].sort(
        (a, b) => a.from.localeCompare(b.from) || a.line - b.line,
      ),
    })),
  };
}

export function checkRules(
  root: string,
  store: Store,
  onlyPath?: string,
): CheckReport {
  const rules = listRules(store);
  const normalizedFocus = onlyPath ? focusPath(root, onlyPath) : undefined;
  const graph = rules.length ? buildGraph(root) : undefined;
  const collected = graph
    ? collectViolations(graph, rules, normalizedFocus)
    : { rules: [], truncated: false };
  const broken = collected.rules.filter((rule) => rule.violations.length > 0);
  return {
    ok: broken.length === 0,
    checked: rules.length,
    broken: broken.length,
    truncated: collected.truncated || Boolean(graph?.truncated),
    rules: collected.rules,
  };
}

export function formatCheck(report: CheckReport): string {
  const lines = [
    'ARCHITECTURE CHECK',
    '',
    `${report.checked} ${report.checked === 1 ? 'rule' : 'rules'} checked`,
    `${report.broken} broken`,
  ];
  if (report.truncated) {
    lines.push('scan truncated');
  }
  if (report.broken === 0) {
    lines.push('');
    lines.push('No broken contracts.');
    return lines.join('\n');
  }
  for (const rule of report.rules) {
    if (rule.violations.length === 0) {
      continue;
    }
    lines.push('');
    lines.push(`${rule.id}  ${rule.note}`);
    for (const hit of rule.violations) {
      lines.push(
        `  ${hit.via}  ${hit.from}:${hit.line} -> ${hit.to}  ${hit.name}`,
      );
    }
  }
  return lines.join('\n');
}
