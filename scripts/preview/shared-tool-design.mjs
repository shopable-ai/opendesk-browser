// Build-time extraction of public visual rules. Never load the privileged host stylesheet at runtime.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export const SHARED_DESIGN_MARKER = '/* @opendesk-shared-design */';
export const SHARED_TOKENS_MARKER = '/* @opendesk-shared-tokens */';
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
// Native @scope confines application skins to their own DOM subtree. Mask
// comments/strings before matching braces so text cannot terminate that boundary.
function withoutApplicationScopes(css) {
  const chars=css.split('');
  for(let i=0;i<css.length;i++){
    if(css[i]==='/'&&css[i+1]==='*'){
      const end=css.indexOf('*/',i+2);
      if(end<0)throw Error('E_PREVIEW_DESIGN: unterminated CSS comment');
      for(let j=i;j<end+2;j++)chars[j]=' ';
      i=end+1;
    }else if(css[i]==='"'||css[i]==="'"){
      const quote=css[i],start=i;
      for(i++;i<css.length&&css[i]!==quote;i++){
        if(/[\n\r\f]/.test(css[i]))throw Error('E_PREVIEW_DESIGN: invalid CSS string newline');
        if(css[i]==='\\'){
          i++;
          if(css[i]==='\r'&&css[i+1]==='\n')i++;
        }
      }
      if(i>=css.length)throw Error('E_PREVIEW_DESIGN: unterminated CSS string');
      for(let j=start;j<=i;j++)chars[j]=' ';
    }
  }
  const masked=chars.join('');
  const scope=/@scope\b/gi;
  let match,previous=0,result='';
  while((match=scope.exec(masked))){
    const header=masked.slice(match.index).match(/^@scope\s*\(\s*\.([a-z][\w-]*)\s*\)\s*\{/i);
    if(!header||/^od-/i.test(header[1]))
      throw Error('E_PREVIEW_DESIGN: application scope requires its own root class');
    const start=match.index+header[0].length;
    let end=start,depth=1;
    for(;end<masked.length&&depth;end++){
      if(masked[end]==='{')depth++;
      if(masked[end]==='}')depth--;
    }
    if(depth)throw Error('E_PREVIEW_DESIGN: unterminated application scope');
    const body=masked.slice(start,end-1);
    if(body.includes('\\')||/\b(?:url|(?:-webkit-)?image-set)\s*\(/i.test(body)||[...body.matchAll(/@([\w-]+)/g)].some(([,name])=>
      !['media','supports','container','starting-style'].includes(name.toLowerCase())))
      throw Error('E_PREVIEW_DESIGN: global at-rule inside application scope');
    result+=css.slice(previous,match.index);
    previous=end;
    scope.lastIndex=end;
  }
  return result+css.slice(previous);
}
export function assertLayoutOnly(css) {
  if(!css.trimStart().startsWith(SHARED_DESIGN_MARKER))
    throw Error('E_PREVIEW_DESIGN: tool must explicitly opt in to shared design');
  const layout = css.trimStart().slice(SHARED_DESIGN_MARKER.length);
  if(/@import\b|url\s*\(\s*['"]?\s*(?:https?:|\/\/|javascript:)/i.test(layout))
    throw Error('E_PREVIEW_DESIGN: remote stylesheet or resource');
  const unscoped=withoutApplicationScopes(layout);
  if(/#[0-9a-f]{3,8}\b|:root\s*\{|--(?:od-|space-|radius-)[a-z\d-]*\s*:/i.test(unscoped))
    throw Error('E_PREVIEW_DESIGN: private design token, color or remote stylesheet');
  if(/(?:^|[},])\s*(?:button|input|textarea|select|\.od-(?:button|icon-button|field))(?=[\s.:#\[{,]|\{)/m.test(unscoped))
    throw Error('E_PREVIEW_DESIGN: global or shared component appearance override');
  // Outside its application scope, a tool may position existing buttons but not skin them.
  // This deliberately distinguishes harmless layout (margin, flex, grid) from visual declarations.
  for(const match of unscoped.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
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
  if(sourceCss.trimStart().startsWith(SHARED_TOKENS_MARKER)){
    const layout=sourceCss.trimStart().slice(SHARED_TOKENS_MARKER.length);
    if(/#[0-9a-f]{3,8}\b|--od-[\w-]+\s*:|@import\b/i.test(layout))
      throw Error('E_PREVIEW_DESIGN: shared tokens cannot contain a private palette');
    // Color-bearing values may reference tokens or mix them. Reject literal
    // functions/names, including colors hidden behind tool-local aliases.
    const keywords=new Set(('transparent currentcolor inherit initial unset revert revert-layer none '+
      'solid dashed dotted double groove ridge inset outset in srgb srgb-linear oklab color-mix '+
      'px rem em vh vw vmin vmax ch ex calc min max clamp').split(' '));
    for(const [,property,value] of layout.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/(?:^|[;{])\s*([\w-]+)\s*:([^;{}]+)/g)){
      if(!/^(?:--|color$|background|border(?:$|-(?:color|top|right|bottom|left))|outline(?:$|-color)|(?:box|text)-shadow$|fill$|stroke$)/i.test(property))continue;
      const remaining=value.replace(/var\(\s*--[\w-]+\s*\)/gi,'').replace(/!important/gi,'');
      if(remaining.includes('\\')||[...remaining.matchAll(/[a-z][\w-]*/gi)].some(([word])=>!keywords.has(word.toLowerCase())))
        throw Error('E_PREVIEW_DESIGN: shared tokens cannot contain a private palette');
    }
    const tokens=await readFile(tokenUrl,'utf8');
    return '/* opendesk.shared-tokens.v1 sha256='+hash(tokens)+' */\n'+tokens+'\n'+layout;
  }
  if(!sourceCss.trimStart().startsWith(SHARED_DESIGN_MARKER))return sourceCss;
  const layout=assertLayoutOnly(sourceCss);
  const {tokens,components,publicRules,digest}=await officialDesignSources();
  const basic=baseSelectors.map(selector=>canonicalRule(components,selector)).join('\n');
  const focus=components.split('\n').find(line=>line.startsWith(':focus-visible{'));
  if(!focus)throw Error('E_PREVIEW_DESIGN: missing canonical focus rule');
  const schemeSource=components.match(/@media\(prefers-color-scheme:dark\)\{\s*:root\{color-scheme:dark\}/);
  if(!schemeSource)throw Error('E_PREVIEW_DESIGN: missing canonical dark color scheme');
  // The sandbox contains its own document. Only approved, non-privileged visuals
  // are copied; host navigation, workspace and page scroll styles are excluded.
  return '/* opendesk.shared-design.v1 sha256='+digest+'; GENERATED from canonical CSS */\n'+
    tokens+'\n'+basic+'\n'+focus+'\n'+schemeSource[0]+'}'+'\n'+publicRules+'\n'+layout;
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
