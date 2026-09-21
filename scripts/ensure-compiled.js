#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'compiled', 'bin', 'lepper.js');

if (!fs.existsSync(entry)) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const compiled = spawnSync(npmCmd, ['run', 'compile'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (compiled.status !== 0) {
    process.exit(compiled.status === null ? 1 : compiled.status);
  }
}

const isGitCheckout = fs.existsSync(path.join(root, '.git'));
const husky = path.join(root, 'node_modules', 'husky', 'bin.js');
if (isGitCheckout && fs.existsSync(husky)) {
  spawnSync(process.execPath, [husky, 'install'], {
    cwd: root,
    stdio: 'ignore',
  });
}
