// The fixed AI Proxy consumer declares its existing settings sections.
// Kept pure JS for Node and WXT; parity with optionsRoute.ts is tested.
const SECTIONS=Object.freeze(['profiles','rules','subscriptions','backup','diagnostic','general','official']);
export function acceptAppPage(page){
  return page?.view==='settings'&&SECTIONS.includes(page.section)?page:null;
}
