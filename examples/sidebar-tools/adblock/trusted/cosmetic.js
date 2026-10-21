export const ADBLOCK_COSMETIC_HOSTS=Object.freeze(['javbus.com','www.javbus.com']);

const STYLE_ID='opendesk-adblock-cosmetic';
const COSMETIC_CSS='.ad-box { display: none !important; }';
const normalizeHost=host=>typeof host==='string'?host.toLowerCase().replace(/\.$/,''):'';

export function createAdblockCosmeticController({
  document=globalThis.document,location=globalThis.location
}={}){
  let style=null,disposed=false;
  const removeStyle=()=>{
    // Keep the reference: a page node with the same ID is never ours to remove.
    style?.remove();
    style=null;
  };
  function apply(state){
    const actualHost=normalizeHost(location?.hostname);
    if(disposed||!state||typeof state!=='object'||Array.isArray(state)||
      state.enabled!==true||!['http:','https:'].includes(location?.protocol)||
      !ADBLOCK_COSMETIC_HOSTS.includes(actualHost)||normalizeHost(state.host)!==actualHost){
      removeStyle();
      return false;
    }
    const parent=document?.head||document?.documentElement;
    if(!parent||typeof document?.createElement!=='function'){
      removeStyle();
      return false;
    }
    if(!style){
      style=document.createElement('style');
      style.id=STYLE_ID;
      // Static CSS also covers later ads without observing or mutating page nodes.
      style.textContent=COSMETIC_CSS;
    }
    if(style.parentNode!==parent)parent.appendChild(style);
    return true;
  }
  return {apply,dispose(){disposed=true;removeStyle();}};
}
