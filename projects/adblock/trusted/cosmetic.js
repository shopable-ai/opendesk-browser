import {validCosmeticSelector} from './cosmetic-policy.js';
export const ADBLOCK_COSMETIC_HOSTS=Object.freeze(['javbus.com','www.javbus.com']);

const STYLE_ID='opendesk-adblock-cosmetic';
const COSMETIC_CSS='.ad-box { display: none !important; }';
const normalizeHost=host=>typeof host==='string'?host.toLowerCase().replace(/\.$/,''):'';

// Single stylesheet owner for existing first-party cosmetic rules AND manual
// site-scoped rules. Removing a rule restores the page without deleting DOM.
export function createAdblockCosmeticController({
  document=globalThis.document,location=globalThis.location
}={}){
  let style=null,disposed=false;
  const removeStyle=()=>{style?.remove();style=null;};
  function apply(state){
    const actualHost=normalizeHost(location?.hostname);
    if(disposed||!state||typeof state!=='object'||Array.isArray(state)||
       state.enabled!==true||!['http:','https:'].includes(location?.protocol)||
       normalizeHost(state.host)!==actualHost){
      removeStyle();return false;
    }
    const manual=Array.isArray(state.rules)?state.rules.filter(rule=>
      rule&&validCosmeticSelector(rule.selector)).map(rule=>rule.selector):[];
    if(validCosmeticSelector(state.pendingSelector))manual.push(state.pendingSelector);
    const css=[...(ADBLOCK_COSMETIC_HOSTS.includes(actualHost)?[COSMETIC_CSS]:[]),
      ...[...new Set(manual)].map(selector=>selector+' { display: none !important; }')];
    if(!css.length){removeStyle();return false;}
    const parent=document?.head||document?.documentElement;
    if(!parent||typeof document?.createElement!=='function'){
      removeStyle();return false;
    }
    if(!style){
      style=document.createElement('style');style.id=STYLE_ID;
      style.textContent=css.join('\n');
    }
    const next=css.join('\n');
    if(style.textContent!==next)style.textContent=next;
    if(style.parentNode!==parent)parent.appendChild(style);
    return true;
  }
  return {apply,dispose(){disposed=true;removeStyle();}};
}
