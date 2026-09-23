import { supportedExtensions } from '../registry';

const KNOWN_EXTENSIONS = new Set(supportedExtensions);

export function moduleFiles(spec: string, known: Set<string>): string[] {
  const cleaned = spec.replace(/\\/g, '/').replace(/^\.\//, '');
  const lastDot = cleaned.lastIndexOf('.');
  const lastSlash = Math.max(
    cleaned.lastIndexOf('/'),
    cleaned.lastIndexOf('\\'),
  );
  const ext = lastDot > lastSlash ? cleaned.slice(lastDot).toLowerCase() : '';
  const scored: Array<{ file: string; score: number }> = [];
  const suffixes = moduleSuffixes(cleaned, ext);
  known.forEach((file) => {
    const relative = file.replace(/^\.\//, '');
    const noExt = relative.replace(/\.[^.]+$/, '');
    const base = relative.split('/').pop() || relative;
    const stem = noExt.split('/').pop() || noExt;
    const parent = noExt.split('/').slice(0, -1).pop() || '';
    let score = 0;
    for (const suffix of suffixes) {
      if (!suffix) {
        continue;
      }
      const pathSuffix = suffix.includes('/') || suffix.includes('.');
      if (
        pathSuffix &&
        (relative === suffix ||
          relative.endsWith(`/${suffix}`) ||
          noExt === suffix ||
          noExt.endsWith(`/${suffix}`))
      ) {
        score = Math.max(score, 5);
      }
      if (base === suffix || stem === suffix) {
        score = Math.max(score, 3);
      }
      if (parent === suffix) {
        score = Math.max(score, 4);
      }
    }
    if (score > 0) {
      scored.push({ file, score });
    }
  });
  if (!scored.length) {
    return [];
  }
  const best = Math.max(...scored.map((item) => item.score));
  const files = scored
    .filter((item) => item.score === best)
    .map((item) => item.file);
  const withImpl: string[] = [];
  for (const file of files) {
    withImpl.push(file);
    if (/\.(h|hpp|hh|hxx)$/.test(file)) {
      const stem = file.replace(/\.(h|hpp|hh|hxx)$/, '');
      for (const implExt of ['.c', '.cpp', '.cc', '.cxx']) {
        const impl = `${stem}${implExt}`;
        if (known.has(impl) && !withImpl.includes(impl)) {
          withImpl.push(impl);
        }
      }
    }
  }
  return withImpl;
}

export function moduleSuffixes(spec: string, ext: string): string[] {
  if (ext && KNOWN_EXTENSIONS.has(ext)) {
    return [spec];
  }
  const parts = spec.split(/::|\.|\/|\\/).filter(Boolean);
  const snakeParts = parts.map(snakeCase);
  const last = parts[parts.length - 1] || '';
  return [parts.join('/'), snakeParts.join('/'), last, snakeCase(last)];
}

export function snakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}
