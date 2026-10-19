// The comparison belongs to Quick Notes React, not generic App CI.
// Preserve the exact existing CLI output as a reviewable test artifact.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
const destination=resolve('artifacts/quick-notes-implementation-comparison.json');
const result=spawnSync(process.execPath,
  ['examples/sidebar-tools/quick-notes-react/scripts/compare.mjs'],
  {cwd:process.cwd(),encoding:'utf8',timeout:120000});
if(result.error)throw result.error;
if(result.status!==0)throw Error(result.stderr||'Quick Notes comparison failed');
const comparison=JSON.parse(result.stdout);
if(comparison.contract!=='quick-notes-native-vs-shared-ui.v1')
  throw Error('Unexpected Quick Notes comparison schema');
await mkdir(dirname(destination),{recursive:true});
await writeFile(destination,JSON.stringify(comparison,null,2)+'\n');
console.log('QUICK_NOTES_COMPARISON_STAGED '+destination);
