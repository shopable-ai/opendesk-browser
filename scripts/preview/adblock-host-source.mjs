// R2.3 React-only official preview contract. No deprecated host DOM snapshots.
// The actual product markup comes from the canonical Vite JSX bundle in the iframe.
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage} from '../build-sidebar-tool.mjs';

const fail=message=>{throw Error('E_ADBLOCK_REACT_PREVIEW: '+message);};
export async function canonicalAdblockPreviewHost(){
  const root=new URL('../../projects/adblock/',import.meta.url);
  const [app,pkg]=await Promise.all([
    readFile(new URL('src/App.jsx',root),'utf8'),
    createSidebarToolPackage(new URL(root).pathname)
  ]);
  if(pkg.uiRuntime!=='opendesk.react-ui.v1'||
      !app.includes("from '@opendesk/ui'")||
      !app.includes('function App()')||
      !pkg.js.includes('OpenDeskPageReact')||
      !pkg.js.includes('OpenDeskSidebarUI'))
    fail('the source-built React product or shared-runtime contract is missing');
  for(const operation of ['adblock.status','adblock.enable','adblock.disable',
    'adblock.site.set','adblock.site.restore'])
    if(!pkg.js.includes(operation))fail('compiled product missing '+operation);
  return {css:'',snapshots:Object.freeze({}),source:'compiled-react'};
}
