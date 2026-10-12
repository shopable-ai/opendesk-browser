// Explicit append-only publication input, derived from the original producer.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createOfficialToolResources} from './build-official-tools.mjs';
import {OFFICIAL_COLLECTIONS} from '../src/marketplace/catalog.js';
import {loadMarketSnapshots,mergeMarketReleases} from './market-release-snapshots.mjs';
const name=process.argv[2];
if(!name||!/^[a-z0-9][a-z0-9.-]*\.json$/.test(name))throw Error('Usage: node scripts/snapshot-market-release.mjs <new-snapshot.json>');
const {catalog}=await createOfficialToolResources();
await mkdir('official-tools/releases',{recursive:true});
mergeMarketReleases(await loadMarketSnapshots(),catalog,OFFICIAL_COLLECTIONS);
const snapshot={schema:'opendesk.market.release-snapshot.v1',source:{kind:'official-builder',
  identity:'sha256:'+createHash('sha256').update(JSON.stringify(catalog)).digest('hex')},catalog,collections:OFFICIAL_COLLECTIONS};
await writeFile(resolve('official-tools/releases',name),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
console.log('Created append-only official release snapshot '+name);
