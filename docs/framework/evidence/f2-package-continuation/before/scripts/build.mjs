import webpack from 'webpack';
import config from '../webpack.config.cjs';
import {cp, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {verifyPackage} from './verify-package.mjs';
const mode = process.argv[2] || 'production';
if (!['production', 'development'].includes(mode)) throw new Error('Invalid build mode');
const compiler = webpack(config(mode));
const stats = await new Promise((done, reject) => compiler.run((error, value) => error ? reject(error) : done(value)));
await new Promise((done, reject) => compiler.close(error => error ? reject(error) : done()));
if (stats.hasErrors()) { console.error(stats.toString({all: false, errors: true})); process.exit(1); }
const out = resolve('dist', mode);
await mkdir(resolve(out, 'ui'), {recursive: true});
await cp('manifest.json', resolve(out, 'manifest.json'));
for (const name of ['tool.html', 'tool-shell.css', 'target-bootstrap.html']) await cp(`src/ui/${name}`, resolve(out, 'ui', name));
const report = await verifyPackage(out);
await mkdir('docs/environment', {recursive: true});
await writeFile(`docs/environment/build-${mode}.json`, JSON.stringify({mode, status: 'passed', report}, null, 2) + '\n');
console.log(JSON.stringify({mode, status: 'passed', packageHash: report.packageHash, assets: report.files.length}));
