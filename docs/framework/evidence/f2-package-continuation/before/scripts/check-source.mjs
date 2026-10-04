import {execFileSync} from 'node:child_process';
import {filesAt} from './verify-package.mjs';
const files = [];
for (const root of ['src', 'scripts', 'tests/environment']) {
  for (const file of await filesAt(root)) if (/\.(?:js|cjs|mjs)$/.test(file)) files.push(`${root}/${file}`);
}
files.push('webpack.config.cjs');
for (const file of files) execFileSync(process.execPath, ['--check', file], {stdio: 'inherit'});
console.log(`Syntax checked ${files.length} source/test/build files`);
