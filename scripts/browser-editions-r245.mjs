// R24.5: one source tree, two independently verified extension distributions.
// This selector only controls extension PACKAGING. It never disables the
// already installed Node/Native local-project JSX/SFC resolver.
import {PAGE_BROWSER_PRIVATE_FILES} from '../src/libs/page-frameworks/contract.js';

export const BROWSER_EDITION_RECORD='framework/browser-edition.json';
export const BROWSER_EDITIONS=Object.freeze(['standard','developer']);
export const DEVELOPER_BROWSER_NAME='OpenDesk Browser Developer';

export function resolveBrowserEdition(value=process.env.OPENDESK_BROWSER_EDITION){
  const edition=value===undefined?'standard':value;
  if(!BROWSER_EDITIONS.includes(edition))
    throw Error('E_BROWSER_EDITION: expected standard or developer');
  return edition;
}

// Daily source development includes the browser JSX/SFC compiler; packaging
// still defaults to Standard unless an edition is explicitly selected.
export function resolveDevelopmentBrowserEdition(value=process.env.OPENDESK_BROWSER_EDITION){
  return resolveBrowserEdition(value??'developer');
}

export function compilerResourcesForEdition(edition){
  return resolveBrowserEdition(edition)==='developer'?PAGE_BROWSER_PRIVATE_FILES:[];
}

export function editionOutputName(mode,edition){
  if(!['production','development'].includes(mode))throw Error('E_BROWSER_EDITION_MODE');
  return mode+(resolveBrowserEdition(edition)==='developer'?'-developer':'');
}

export function editionRecord(edition){
  const selected=resolveBrowserEdition(edition);
  return Object.freeze({
    format:'opendesk.browser-edition.v1',
    edition:selected,
    browserComponentCompiler:selected==='developer'
  });
}

export function editionRecordText(edition){
  return JSON.stringify(editionRecord(edition),null,2)+'\n';
}

export function readEditionRecord(text){
  if(typeof text!=='string')throw Error('E_BROWSER_EDITION_RECORD');
  let record;
  try{record=JSON.parse(text);}catch{throw Error('E_BROWSER_EDITION_RECORD');}
  const edition=resolveBrowserEdition(record?.edition);
  if(text!==editionRecordText(edition))
    throw Error('E_BROWSER_EDITION_RECORD: unexpected bytes or capability');
  return edition;
}
