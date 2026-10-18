// Reproducible static accounting; browser performance requires separate real Chrome runs.
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../../../scripts/build-sidebar-tool.mjs';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../../../src/libs/page-frameworks/contract.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const repo=resolve(root,'../../..');
const original=resolve(repo,'examples/sidebar-tools/quick-notes');
const count=content=>content.trimEnd().split('\n').length;
const read=async(dir,path)=>readFile(resolve(dir,path),'utf8');
const source=async(dir,paths)=>{
  const rows=[];
  for(const path of paths){const raw=await read(dir,path);rows.push({path,lines:count(raw),bytes:Buffer.byteLength(raw)});}
  return rows;
};
async function main(){
  const native=await createSidebarToolPackage(original);
  const react=await createSidebarToolPackage(root); // requires a successful real Vite build
  const installedReact=encodeSidebarToolPackage(react);
  const installedNative=encodeSidebarToolPackage(native);
  const nativeSource=await source(original,['src/main.js','src/index.html','src/style.css','tool.config.json']);
  const reactSource=await source(root,['src/model.js','src/App.jsx','src/main.jsx',
    'src/root.html','src/style.css','tool.config.json','vite.config.mjs','package.json']);
  const dir=resolve(repo,process.env.OPENDESK_SHARED_UI_EXTENSION_DIR||'dist/development');
  const size=async path=>(await stat(resolve(dir,path))).size;
  const result={
    contract:'quick-notes-native-vs-shared-ui.v1',
    identities:{native:native.id,react:react.id},
    versions:{native:native.version,react:react.version},
    countedHandwrittenSources:{native:nativeSource,react:reactSource},
    generatedToolBytes:{
      native:{js:Buffer.byteLength(native.js),css:Buffer.byteLength(native.css),package:installedNative.length},
      react:{js:Buffer.byteLength(react.js),css:Buffer.byteLength(react.css),package:installedReact.length}
    },
    fixedBrowserResourcesNotFree:{
      react19:PAGE_FRAMEWORK_RUNTIMES.react.bytes,
      sharedUI:await size('sidebar-shared-ui.js'),
      sharedUICSS:await size('ui/design-tokens.css'),
      sharedUINotices:await size('licenses/shared-ui-third-party-notices.txt')
    },
    unmeasured:['Chrome startup P50','interaction P50','memory by same profile','human development hours','long-run leaks'],
    notes:['Native main.js mixes business and DOM handlers; do not assign all of it to business-only LOC.',
      'Shared resources are browser-owned and may be amortized among independent installed tools.',
      'Package bytes are UTF-8 canonical JSON sizes, not installation download gzip sizes.']
  };
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
