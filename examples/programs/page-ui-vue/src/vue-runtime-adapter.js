// Small, explicitly bounded adapter for the R24.3 Vue SFC demonstration.
//
// Vite's Vue plugin compiles <template> into helper imports from 'vue'.
// Alias those imports here so the authored component reuses the SAME Vue
// instance as the extension-pinned USER_SCRIPT runtime. This is intentionally
// NOT a replacement for @vue/runtime-dom or full Vue SFC compatibility:
// unknown compiler helpers cause an export/build error rather than pulling
// a second copy of Vue into the user's bundle.
//
// The full arbitrary-template solution must expand and pin the audited
// extension runtime API before widening the compilation contract.
function api(){
  const vue=globalThis.OpenDeskPageVue;
  if(vue?.version!=='3.5.22')throw Error('E_PAGE_FRAMEWORK_NOT_READY');
  return vue;
}
export const createApp=(...args)=>api().createApp(...args);
export const ref=(...args)=>api().ref(...args);
export const onMounted=(...args)=>api().onMounted(...args);

// The fixture's <template> uses ordinary HTML nodes and text interpolation.
// h() creates genuine VNodes from the pinned Vue runtime. Discarding compiler
// block hints uses Vue's regular (unoptimized) patch path; no DOM bypass,
// innerHTML insertion, or separate runtime is introduced.
export const openBlock=()=>undefined;
export const createElementBlock=(...args)=>api().h(args[0],args[1],args[2]);
export const createElementVNode=(...args)=>api().h(args[0],args[1],args[2]);
export const toDisplayString=value=>value==null?'':String(value);
