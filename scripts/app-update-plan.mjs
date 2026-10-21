// A pure decision helper for the human-facing Sidebar App update workflow.
// Version ordering comes from the existing installer; no new install policy here.
import {compareToolVersions} from '../src/ui/sidebar-tools/installation.js';

export function nextPatchVersion(version){
  if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw Error('E_APP_VERSION: expected a three-part nonnegative version');
  const [major,minor,patch]=version.split('.');
  return `${major}.${minor}.${BigInt(patch)+1n}`;
}

export function decideSidebarAppUpdate({previous,proposed,bytesEqual}){
  if(!proposed||typeof proposed.id!=='string'||!proposed.id||typeof proposed.version!=='string')
    throw Error('E_APP_PACKAGE: missing proposed app identity');
  if(!previous)return Object.freeze({kind:'NEW_APP',version:proposed.version});
  if(previous.id!==proposed.id||previous.format!==proposed.format)
    throw Error('E_APP_IDENTITY: app ID or package format changed');
  const order=compareToolVersions(proposed.version,previous.version);
  if(order<0)throw Error('E_APP_DOWNGRADE: proposed package version is older than last release');
  if(bytesEqual){
    if(order!==0)throw Error('E_APP_PACKAGE: equal package bytes with different versions');
    return Object.freeze({kind:'ALREADY_CURRENT',version:proposed.version});
  }
  if(order>0)return Object.freeze({kind:'READY_WITH_VERSION',version:proposed.version});
  if(JSON.stringify(previous.capabilities)!==JSON.stringify(proposed.capabilities)||
    JSON.stringify(previous.requires??null)!==JSON.stringify(proposed.requires??null)||
    JSON.stringify(previous.contributes??null)!==JSON.stringify(proposed.contributes??null)||
    JSON.stringify(previous.backgroundPolicy??null)!==JSON.stringify(proposed.backgroundPolicy??null))
    throw Error('E_APP_REVIEW_REQUIRED: capability or managed policy changed; review and set a new version explicitly');
  return Object.freeze({kind:'BUMP_PATCH',version:nextPatchVersion(previous.version)});
}
