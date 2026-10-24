// Source-derived component fixtures. Native tests must read their actual dist.
import {readFile} from 'node:fs/promises';
import {createOfficialToolResources} from '../../scripts/build-official-tools.mjs';
import {officialPackagePath} from '../../src/sidebar-tools/official-catalog.js';
import {OFFICIAL_READING_TOC_RELEASE} from '../../src/sidebar-tools/official-reading-toc.js';
import {sidebarToolPackageHash,validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
let fixture;
export const officialFixtures=()=>fixture||(fixture=createOfficialToolResources());
export async function officialToolFixture(id){
  if(id==='reading-toc'){
    // Use the committed official package and its production digest gate.
    // Other tools' unbuilt dist must not affect Reading TOC evidence checks.
    const bytes=await readFile(new URL('../../examples/sidebar-tools/reading-toc/reading-toc.opendesk-tool.json',import.meta.url));
    const tool=validateSidebarToolPackage(JSON.parse(bytes.toString('utf8')));
    const pin=OFFICIAL_READING_TOC_RELEASE;
    if(tool.id!==pin.id||tool.version!==pin.version||await sidebarToolPackageHash(tool)!==pin.sha256)
      throw new Error('E_OFFICIAL_FIXTURE_PIN: Reading TOC package differs from reviewed release');
    return tool;
  }
  return JSON.parse((await officialFixtures()).resources.get(officialPackagePath(id)).toString('utf8'));
}
export async function officialFixtureFetch(url){
  const path=new URL(url).pathname.slice(1),bytes=(await officialFixtures()).resources.get(path);
  return bytes?new Response(bytes,{status:200}):new Response('missing',{status:404});
}
