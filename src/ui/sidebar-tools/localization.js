import {compileToolLocaleCatalog,canonicalUiLocale} from '../app-localization.js';

const fail=message=>{const error=new Error('E_TOOL_LOCALIZATION: '+message);
  error.code='E_TOOL_LOCALIZATION';throw error;};
const forbidden=new Set(['constructor','prototype','__proto__']);
function record(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     ![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('expected plain data object');
  for(const key of Reflect.ownKeys(value)){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||forbidden.has(key)||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))
      fail('unsafe data field');
  }
  return value;
}
function exact(value,keys){
  record(value);
  if(Object.keys(value).sort().join(',')!==[...keys].sort().join(','))fail('unknown or missing field');
}
function text(value){
  if(typeof value!=='string'||value.length>380||
     /[<>\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)||
     /(?:javascript|vbscript|data|file)\s*:|\bon[a-z]+\s*=/i.test(value))fail('unsafe message text');
  if(!value.replace(/[\s\p{Default_Ignorable_Code_Point}]/gu,''))fail('blank message text');
}
function validateCatalog(value){
  exact(value,['sourceLocale','messages']);
  if(typeof value.sourceLocale!=='string'||value.sourceLocale!==canonicalUiLocale(value.sourceLocale))
    fail('noncanonical source language');
  const groups=record(value.messages),ids=Object.keys(groups);
  if(!ids.length||ids.length>12||!Object.hasOwn(groups,value.sourceLocale)||
     ids.some(id=>id!==canonicalUiLocale(id)))fail('invalid languages');
  const source=record(groups[value.sourceLocale]),keys=Object.keys(source);
  if(!keys.length||keys.length>160)fail('invalid source message count');
  for(const key of keys){
    if(!/^[a-z][a-zA-Z0-9]{0,63}$/.test(key))fail('invalid message key');
    text(source[key]);
  }
  // Reuse the authoring compiler's source-key and placeholder checks. Compiled
  // metadata contains plain text, so reconstruct its reviewed target rows only
  // for validation; no runtime or executable tool source is inspected here.
  const reviewed={[value.sourceLocale]:source};
  for(const lang of ids){
    if(lang===value.sourceLocale)continue;
    const rows=record(groups[lang]);
    if(Object.keys(rows).length>160)fail('too many messages');
    reviewed[lang]={};
    for(const [key,message] of Object.entries(rows)){
      if(!Object.hasOwn(source,key))fail('unknown message key');
      text(message);
      reviewed[lang][key]={source:source[key],text:message};
    }
  }
  compileToolLocaleCatalog({sourceLocale:value.sourceLocale,messages:reviewed});
  return value;
}

// Synchronous admission checks structure and text, never trusts a declared hash.
export function validateToolLocalization(value){
  exact(value,['sourceLocale','sourceCatalogHash','messages']);
  if(typeof value.sourceCatalogHash!=='string'||!/^[a-f0-9]{64}$/.test(value.sourceCatalogHash))
    fail('invalid source SHA-256');
  validateCatalog({sourceLocale:value.sourceLocale,messages:value.messages});
  return structuredClone(value);
}

// Compact JSON, fixed outer order, source keys in JS default lexicographic order.
// No whitespace/newline or Unicode normalization is added before UTF-8 hashing.
export function canonicalToolSource(localization){
  const value=validateToolLocalization(localization);
  const source=value.messages[value.sourceLocale];
  return JSON.stringify({sourceLocale:value.sourceLocale,
    messages:Object.fromEntries(Object.keys(source).sort().map(key=>[key,source[key]]))});
}
async function sourceHash(value){
  const bytes=new TextEncoder().encode(canonicalToolSource(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function verifyToolLocalization(value){
  const checked=validateToolLocalization(value);
  if(await sourceHash(checked)!==checked.sourceCatalogHash)fail('source SHA-256 mismatch');
  return checked;
}
export async function createToolLocalization(compiledCatalog){
  validateCatalog(compiledCatalog);
  const value={...structuredClone(compiledCatalog),sourceCatalogHash:'0'.repeat(64)};
  value.sourceCatalogHash=await sourceHash(value);
  return validateToolLocalization(value);
}
