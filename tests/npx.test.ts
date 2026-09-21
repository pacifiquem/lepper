import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

describe('npx packaging', () => {
  it('exposes lepper and lepper-mcp binaries', () => {
    expect(pkg.bin.lepper).toBe('./compiled/bin/lepper.js');
    expect(pkg.bin['lepper-mcp']).toBe('./compiled/bin/lepper-mcp.js');
    expect(pkg.files).toContain('compiled');
    expect(pkg.files).toContain('docs');
  });

  it('ships compiled MCP entrypoints after compile', () => {
    const root = path.join(__dirname, '..');
    expect(fs.existsSync(path.join(root, 'compiled', 'bin', 'lepper.js'))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(root, 'compiled', 'bin', 'lepper-mcp.js')),
    ).toBe(true);

    const mcp = fs.readFileSync(
      path.join(root, 'compiled', 'bin', 'lepper-mcp.js'),
      'utf-8',
    );
    expect(mcp.startsWith('#!/usr/bin/env node')).toBe(true);
    expect(mcp).toMatch(/startMcpServer/);
  });
});
