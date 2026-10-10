import {canonical, invariant} from '../../platform/protocol.js';
import {validatePageProgramRules} from './page-program-rules.js';

// Installed Page v1 currently exposes only isolated DOM execution. Empty
// network origins are intentional: a Chrome grant or public SDK never supplies
// this program with HTTP, cookies, storage, Native or another program's rights.
export function pageInstallScope(pageRules) {
  return {capabilities:['page.dom'],pageRules:structuredClone(validatePageProgramRules(pageRules)),networkOrigins:[]};
}
export function pageInstallScopeDelta(previous, next) {
  const before=previous?.pageRules,after=next.pageRules;
  const addedSites=after.matches.filter(pattern=>!before?.matches.includes(pattern));
  const removedExclusions=(before?.excludeMatches||[]).filter(pattern=>!after.excludeMatches.includes(pattern));
  // Only syntactically identical patterns are proven reusable. An unfamiliar
  // wildcard rewrite is explicitly reviewed instead of guessed to be narrower.
  const changedExecution=!!before&&['runAt','allFrames','world'].some(name=>before[name]!==after[name]);
  return {requiresConfirmation:!previous||!!(addedSites.length||removedExclusions.length||changedExecution),
    addedSites,removedExclusions,changedExecution};
}
export function assertPageInstallAuthorization(row) {
  const grant=row.authorization;
  invariant(grant?.tag==='page-install-authorization-v1'&&typeof grant.installationId==='string'&&
    /^[a-f0-9-]{36}$/.test(grant.installationId)&&Number.isSafeInteger(grant.generation)&&grant.generation>0&&
    ['active','disabled','suspended','needs-confirmation'].includes(grant.status)&&
    Number.isSafeInteger(grant.approvedAt)&&
    canonical(grant.scope)===canonical(pageInstallScope(row.pageRules)),
    'E_PAGE_AUTHORIZATION','程序安装授权与固定版本的能力范围不一致');
  return grant;
}
function patternParts(pattern) {
  if(pattern==='<all_urls>')return ['*','*'];
  const match=typeof pattern==='string'&&pattern.match(/^(\*|https?):\/\/([^/]+)\//);
  const hostname=match&&match[2].toLowerCase().match(/^(\[[^\]]+\]|[^:]+)(?::(?:\*|[0-9]+))?$/)?.[1];
  return hostname?[match[1],hostname]:null; // Chrome host grants do not isolate ports.
}
export function pageInstallAffectedByRemoval(pageRules,removed) {
  if(removed.permissions?.includes('userScripts'))return true;
  return (removed.origins||[]).some(pattern=>pageRules.matches.some(site=>{
    const a=patternParts(pattern),b=patternParts(site);
    if(!a||!b)return false;
    if(a[0]!==b[0]&&a[0]!=='*'&&b[0]!=='*')return false;
    const covers=(x,y)=>x==='*'||x===y||x.startsWith('*.')&&
      (y===x.slice(2)||y.endsWith('.'+x.slice(2)));
    return covers(a[1],b[1])||covers(b[1],a[1]);
  }));
}
