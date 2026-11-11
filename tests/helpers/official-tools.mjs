// Source-derived component fixtures. Native tests must read their actual dist.
import {readFile} from 'node:fs/promises';
import {createOfficialToolResources} from '../../scripts/build-official-tools.mjs';
import {officialPackagePath} from '../../src/sidebar-tools/official-catalog.js';
import {OFFICIAL_READING_TOC_RELEASE} from '../../src/sidebar-tools/official-reading-toc.js';
import {sidebarToolPackageHash,validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
let fixture;
export const officialFixtures=()=>fixture||(fixture=createOfficialToolResources());
export async function officialToolFixture(id){
  if(id==='ai-proxy'){
    // AI Proxy is distributed independently; installed-tool tests must not
    // reintroduce it into the Browser's offline catalog or fetch resources.
    return validateSidebarToolPackage(JSON.parse(await readFile(
      new URL('../../projects/ai-proxy/ai-proxy.opendesk-tool.json',import.meta.url),'utf8')));
  }
  if(id==='reading-toc'){
    // Exercise the exact reviewed legacy page.toc release, not the current
    // page.module build (1.1.x). Never re-pin a different capability model.
    // The historical bytes were taken from immutable commit 7c16570799a9293e5aa2f05191df2b058fa6f2cb
    // and are still checked against the unchanged production SHA-256 pin.
    const bytes=await readFile(new URL('../fixtures/reading-toc-reviewed-1.0.15.opendesk-tool.json',import.meta.url));
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
