// Build-only evidence. Never emitted into dist or imported by extension code.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,relative,sep,isAbsolute} from 'node:path';

export function modulePath(id,root) {
  if(id.startsWith('\0'))return 'virtual:'+id.slice(1).split(root).join('<root>');
  const file=id.split('?')[0];
  if(!isAbsolute(file))return 'virtual:'+id;
  const path=relative(root,file).split(sep).join('/');
  if(path.startsWith('../')||path==='..')throw Error('Build module outside repository: '+id);
  return path;
}
export function describeBundle({chunk,root=process.cwd(),lock}) {
  const modules=Object.entries(chunk.modules).map(([id,info])=>{
    const path=modulePath(id,root);
    if(/^(?:docs\/contracts\/source-snapshots\/|examples\/|src\/vendor\/)/.test(path))
      throw Error('Historical/user/vendor code cannot enter a privileged fixed bundle: '+path);
    const row={path,renderedLength:info.renderedLength,originalLength:info.originalLength};
    if(path.startsWith('node_modules/')){
      const parts=path.split('/'),index=parts.lastIndexOf('node_modules');
      const count=parts[index+1].startsWith('@')?3:2;
      const packagePath=parts.slice(0,index+count).join('/'),entry=lock.packages?.[packagePath];
      if(!entry?.version||!entry.integrity)throw Error('Bundled npm module missing lock provenance: '+path);
      row.npm={name:parts.slice(index+1,index+count).join('/'),version:entry.version,
        resolved:entry.resolved,integrity:entry.integrity,...(entry.license?{license:entry.license}:{})};
    }
    return row;
  }).sort((a,b)=>a.path.localeCompare(b.path));
  return {target:chunk.fileName,modules,
    note:'Rollup module graph; renderedLength is pre-minification characters, not final bytes or browser execution proof.'};
}
export async function recordBundle(chunk) {
  const directory=process.env.OPENDESK_MODULE_EVIDENCE_DIR;
  if(!directory)return; // Direct WXT debugging is not a verified build receipt.
  const lock=JSON.parse(await readFile('package-lock.json','utf8'));
  const record=describeBundle({chunk,lock});
  await writeFile(resolve(directory,encodeURIComponent(chunk.fileName)+'.json'),
    JSON.stringify(record),{flag:'wx'});
}
export async function collectBundleEvidence(directory,targets,files) {
  const names=targets.map(target=>encodeURIComponent(target)+'.json').sort();
  if(JSON.stringify((await readdir(directory)).sort())!==JSON.stringify(names))
    throw Error('Incomplete or extra fixed-entry module evidence');
  return Promise.all([...targets].sort().map(async target=>{
    const record=JSON.parse(await readFile(resolve(directory,encodeURIComponent(target)+'.json'),'utf8'));
    const output=files.find(file=>file.path===target);
    if(record.target!==target||!record.modules?.length||!output)
      throw Error('Module evidence does not match verified package: '+target);
    return {...record,bytes:output.bytes,sha256:output.sha256};
  }));
}
