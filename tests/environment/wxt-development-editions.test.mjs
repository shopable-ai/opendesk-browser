import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {publishDevelopment} from '../../scripts/wxt-development.mjs';
import {BROWSER_EDITION_RECORD,editionRecordText,DEVELOPER_BROWSER_NAME} from '../../scripts/browser-editions-r245.mjs';
import {resolveMarketChannel,marketExternalConnectable} from '../../scripts/market-channel.mjs';

async function fixture(edition,name){
  const root=await mkdtemp(join(tmpdir(),'opendesk-dev-edition-'));
  const outDir=join(root,'dist','development');
  await mkdir(join(outDir,'framework'),{recursive:true});
  const source=JSON.parse(await readFile('manifest.json','utf8'));
  const manifest={...source,name};
  const external=marketExternalConnectable(resolveMarketChannel({mode:'development'}));
  if(external)manifest.externally_connectable=external;
  else delete manifest.externally_connectable;
  await writeFile(join(root,'manifest.json'),JSON.stringify(source));
  await writeFile(join(outDir,'manifest.json'),JSON.stringify(manifest));
  await writeFile(join(outDir,BROWSER_EDITION_RECORD),editionRecordText(edition));
  return {root,outDir,wxt:{config:{root,outDir}}};
}

test('Daily publisher accepts either reviewed edition in the same development directory',async()=>{
  for(const [edition,name] of [['standard','OpenDesk Browser'],['developer',DEVELOPER_BROWSER_NAME]]){
    const f=await fixture(edition,name);
    try{
      // Stop at the deliberately absent official catalog: this tests the real
      // manifest/edition gate without constructing or publishing a fake bundle.
      await assert.rejects(publishDevelopment(f.wxt,{}),error=>error.code==='ENOENT'&&error.path?.endsWith('official-tools/catalog.json'));
      assert.equal(JSON.parse(await readFile(join(f.outDir,'manifest.json'),'utf8')).name,name);
    }finally{await rm(f.root,{recursive:true,force:true});}
  }
});

test('Daily publisher rejects a cross-edition manifest before publishing a revision',async()=>{
  const f=await fixture('standard',DEVELOPER_BROWSER_NAME);
  try{await assert.rejects(publishDevelopment(f.wxt,{}),/manifest name differs/);}
  finally{await rm(f.root,{recursive:true,force:true});}
});
