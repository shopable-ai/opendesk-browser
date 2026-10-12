import {readFile,readdir,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateOfficialReleaseCatalog} from '../src/sidebar-tools/official-catalog.js';
import {validateMarketSubject} from '../src/marketplace/intent.js';
const fields=(v,list)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...list].sort().join(',');
export function validateCollection(row){
  if(!fields(row,['id','revision','title','description','members'])||typeof row.title!=='string'||
    !row.title||row.title.length>120||typeof row.description!=='string'||row.description.length>500||
    !Array.isArray(row.members)||!row.members.length||row.members.length>12)throw Error('Invalid collection snapshot');
  validateMarketSubject({kind:'collection',collectionId:row.id,revision:row.revision});
  const ids=new Set();
  for(const m of row.members){
    if(!fields(m,['id','version'])||ids.has(m.id))throw Error('Invalid fixed collection member');
    validateMarketSubject({kind:'app',marketId:m.id,version:m.version});ids.add(m.id);
  }
  return structuredClone(row);
}
export function mergeMarketReleases(snapshots,current,collections){
  const releases=new Map(),sets=new Map();
  const addRelease=row=>{
    const key=row.id+'@'+row.version,prior=releases.get(key);
    // Installation policy belongs to the extension generation, not executable
    // identity. Every fixed version keeps the exact original package bytes.
    if(prior&&(prior.sha256!==row.sha256||prior.bytes!==row.bytes||prior.packageTitle!==row.packageTitle||
      prior.description!==row.description||JSON.stringify(prior.capabilities)!==JSON.stringify(row.capabilities)))
      throw Error('Immutable release conflict: '+key+'; publish a new version');
    if(!prior)releases.set(key,row);
  };
  const addCollection=row=>{
    validateCollection(row);const key=row.id+'@'+row.revision,prior=sets.get(key);
    if(prior&&JSON.stringify(prior)!==JSON.stringify(row))throw Error('Immutable collection conflict: '+key);
    sets.set(key,row);
  };
  for(const snapshot of snapshots){
    if(!fields(snapshot,['schema','source','catalog','collections'])||snapshot.schema!=='opendesk.market.release-snapshot.v1'||
      !fields(snapshot.source,['kind','identity'])||!['official-builder','recorded-release-evidence'].includes(snapshot.source.kind)||
      typeof snapshot.source.identity!=='string'||snapshot.source.identity.length>500||!Array.isArray(snapshot.collections))
      throw Error('Invalid controlled release snapshot');
    validateOfficialReleaseCatalog(snapshot.catalog).apps.forEach(addRelease);
    snapshot.collections.forEach(addCollection);
  }
  validateOfficialReleaseCatalog(current).apps.forEach(addRelease);collections.forEach(addCollection);
  return {releases:[...releases.values()],collections:[...sets.values()]};
}
export async function loadMarketSnapshots(directory=resolve('official-tools/releases')){
  const names=(await readdir(directory)).sort(),snapshots=[];
  for(const name of names){
    if(!/^[a-z0-9][a-z0-9.-]*\.json$/.test(name))throw Error('Unexpected release snapshot file: '+name);
    const file=resolve(directory,name),stat=await lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256000)throw Error('Invalid release snapshot input: '+name);
    snapshots.push(JSON.parse(await readFile(file,'utf8')));
  }
  return snapshots;
}
