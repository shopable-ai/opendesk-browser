// Build-time extraction of public visual rules. Never load the privileged host stylesheet at runtime.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export const SHARED_DESIGN_MARKER = '/* @opendesk-shared-design */';
const tokenUrl = new URL('../../src/ui/design-tokens.css', import.meta.url);
const componentUrl = new URL('../../src/ui/design-system.css', import.meta.url);
const sharedStart = '/* Shared primitives:';
const sharedEnd = '/* Keep the trusted tool host';
const baseSelectors = [':root','*','[hidden]','body','input,select,textarea',
  'input,select','input[type=checkbox]','textarea','button','button:disabled',
  'button:hover:not(:disabled)'];
const hash = value => createHash('sha256').update(value).digest('hex');

function canonicalRule(css, selector) {
  const line = css.split('\n').find(row=>row.startsWith(selector+'{'));
  if(!line || !line.endsWith('}')) throw Error('E_PREVIEW_DESIGN: missing official CSS rule '+selector);
  return line;
}
export function assertLayoutOnly(css) {
  if(!css.trimStart().startsWith(SHARED_DESIGN_MARKER))
    throw Error('E_PREVIEW_DESIGN: tool must explicitly opt in to shared design');
  const layout = css.trimStart().slice(SHARED_DESIGN_MARKER.length);
  if(/@import\b|url\s*\(\s*['"]?\s*(?:https?:|\/\/)|#[0-9a-f]{3,8}\b|:root\s*\{|--(?:od-|space-|radius-)[a-z\d-]*\s*:/i.test(layout))
    throw Error('E_PREVIEW_DESIGN: private design token, color or remote stylesheet');
  if(/(?:^|[},])\s*(?:button|input|textarea|select|\.od-(?:button|icon-button|field))(?=[\s.:#\[{,]|\{)/m.test(layout))
    throw Error('E_PREVIEW_DESIGN: global or shared component appearance override');
  // A tool may position an existing button but may not establish its own visual skin.
  // This deliberately distinguishes harmless layout (margin, flex, grid) from visual declarations.
  // Comments are not selectors. Scan CSS tokens after removing inert comments:
  // this prevents a comment such as "square-button form" from reclassifying
  // a following layout-only rule as a forbidden custom button appearance.
  // Stripping comments also exposes declarations split with CSS comments.
  const activeLayout=layout.replace(/\/\*[\s\S]*?\*\//g,'');
  for(const match of activeLayout.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    const selector=match[1],declarations=match[2];
    if(/(?:\.|#|\s)(?:[\w-]*button|[\w-]*btn)\b|\bbutton\b/i.test(selector)&&
      /(?:^|;)\s*(?:background(?:-color)?|border(?:-[\w-]+)?|color|font(?:-[\w-]+)?|box-shadow|padding(?:-[\w-]+)?|outline(?:-[\w-]+)?)\s*:/i.test(declarations))
      throw Error('E_PREVIEW_DESIGN: custom button appearance is forbidden');
  }
  return layout;
}
export async function officialDesignSources() {
  const [tokens,components]=await Promise.all([readFile(tokenUrl,'utf8'),readFile(componentUrl,'utf8')]);
  const start=components.indexOf(sharedStart),end=components.indexOf(sharedEnd);
  if(start<0||end<=start)throw Error('E_PREVIEW_DESIGN: official public component boundary missing');
  const publicRules=components.slice(start,end).trim();
  for(const name of ['.od-button{','.od-icon-button{','.od-field{','.od-surface{','.od-disclosure{']){
    // .od-field is implemented with :is(input,select,textarea).od-field.
    const selector=name==='.od-field{'?'.od-field{':name;
    if(selector!=='.od-field{'&&!publicRules.includes(selector))
      throw Error('E_PREVIEW_DESIGN: missing official component '+name);
  }
  if(!publicRules.includes(').od-field{'))
    throw Error('E_PREVIEW_DESIGN: missing official field component');
  return {tokens,components,publicRules,
    digest:hash(tokens+'\n'+components)};
}
export async function compileSharedToolCss(sourceCss) {
  if(!sourceCss.trimStart().startsWith(SHARED_DESIGN_MARKER))return sourceCss;
  const layout=assertLayoutOnly(sourceCss);
  const {tokens,components,publicRules,digest}=await officialDesignSources();
  const basic=baseSelectors.map(selector=>canonicalRule(components,selector)).join('\n');
  const focus=components.split('\n').find(line=>line.startsWith(':focus-visible,#workspace-content :focus-visible{'));
  if(!focus)throw Error('E_PREVIEW_DESIGN: missing canonical focus rule');
  const scopedFocus=focus.replace(',#workspace-content :focus-visible','');
  const schemeSource=components.match(/@media\(prefers-color-scheme:dark\)\{\s*:root\{color-scheme:dark\}/);
  if(!schemeSource)throw Error('E_PREVIEW_DESIGN: missing canonical dark color scheme');
  // The sandbox contains its own document. Only approved, non-privileged visuals
  // are copied; host navigation, workspace and page scroll styles are excluded.
  return '/* opendesk.shared-design.v1 sha256='+digest+'; GENERATED from canonical CSS */\n'+
    tokens+'\n'+basic+'\n'+scopedFocus+'\n'+schemeSource[0]+'}'+'\n'+publicRules+'\n'+layout;
}
export async function canonicalThemeOverride(theme) {
  if(!['light','dark'].includes(theme))throw Error('E_PREVIEW_THEME: unsupported theme');
  const {tokens}=await officialDesignSources();
  const light=tokens.match(/:root\s*\{([^}]+)\}/);
  const dark=tokens.match(/@media\s*\(prefers-color-scheme:dark\)\s*\{\s*:root\s*\{([^}]+)\}\s*\}/);
  if(!light||!dark)throw Error('E_PREVIEW_THEME: canonical theme source unavailable');
  // Preview-only forced theme; every value is read from the canonical token CSS.
  return ':root{color-scheme:'+theme+';'+(theme==='dark'?dark[1]:light[1])+'}';
}
