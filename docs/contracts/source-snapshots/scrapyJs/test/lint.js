const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const roots = ['src'];
const explicitFiles = [
  'test/phase4.spec.js',
  'vitest.config.js'
];

function walk(targetPath) {
  for (const entry of fs.readdirSync(targetPath)) {
    const fullPath = path.join(targetPath, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!fullPath.endsWith('.js')) {
      continue;
    }

    execFileSync(process.execPath, ['--check', fullPath], { stdio: 'inherit' });
  }
}

for (const root of roots) {
  if (fs.existsSync(root)) {
    walk(root);
  }
}

for (const file of explicitFiles) {
  if (fs.existsSync(file)) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
}
