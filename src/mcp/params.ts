export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export function textResult(value: unknown, isError = false): ToolResult {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }], isError };
}

export function str(
  params: Record<string, unknown> | undefined,
  key: string,
): string {
  const value = params?.[key];
  return value == null ? '' : String(value);
}

export function num(
  params: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = params?.[key];
  if (value == null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function linesOf(
  params: Record<string, unknown> | undefined,
  key: string,
): string[] {
  const value = params?.[key];
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  return [];
}

export function tagsOf(params: Record<string, unknown> | undefined): string[] {
  const value = params?.tags;
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim());
  }
  return [];
}
