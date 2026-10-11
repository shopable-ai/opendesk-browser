// Source-derived component fixtures. Native tests must read their actual dist.
import {createOfficialToolResources} from '../../scripts/build-official-tools.mjs';
import {officialPackagePath} from '../../src/sidebar-tools/official-catalog.js';
let fixture;
export const officialFixtures=()=>fixture||(fixture=createOfficialToolResources());
export async function officialToolFixture(id){
  return JSON.parse((await officialFixtures()).resources.get(officialPackagePath(id)).toString('utf8'));
}
export async function officialFixtureFetch(url){
  const path=new URL(url).pathname.slice(1),bytes=(await officialFixtures()).resources.get(path);
  return bytes?new Response(bytes,{status:200}):new Response('missing',{status:404});
}
