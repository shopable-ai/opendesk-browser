import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createOfficialPageResources} from '../../scripts/build-official-pages.mjs';
import {officialPagePackagePath,OFFICIAL_PAGE_CATALOG_PATH} from '../../src/scripting/user-scripts/official-page-catalog.js';

// Simulate an approved release for installer lifecycle tests. Production source
// approval is unchanged; the real frozen package still goes through validation.
export async function approvedPageFixtureResources(){
  const {resources,catalog}=await createOfficialPageResources();
  const bytes=await readFile(new URL('../../projects/ai-scroll-navigation/ai-scroll-navigation.opendesk-page.json',import.meta.url));
  const pkg=JSON.parse(bytes.toString('utf8'));
  const index=catalog.apps.findIndex(row=>row.programId===pkg.programId);
  const {blockedReason,...descriptor}=catalog.apps[index];
  const packagePath=officialPagePackagePath(pkg.programId);
  catalog.apps[index]={...descriptor,status:'available',packagePath,bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex'),sourceHash:pkg.sourceHash,packageHash:pkg.packageHash};
  resources.set(packagePath,bytes);
  resources.set(OFFICIAL_PAGE_CATALOG_PATH,Buffer.from(JSON.stringify(catalog)));
  return {resources,catalog};
}
