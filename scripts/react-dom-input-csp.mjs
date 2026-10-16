// The pinned ReactDOM 19.2.0 client input-value tracker checks the descriptor
// on node.constructor.prototype. On actual native input/checkbox instances,
// Object.getPrototypeOf(node) selects that same prototype without consulting an
// overridable constructor property. Do not relax the package AST/CSP scanner.
const PINNED_REACT_DOM_VERSION='19.2.0';
const CLIENT_MODULE=/\/node_modules\/react-dom\/cjs\/react-dom-client\.(?:production|development)\.js$/;
const TRACKER_DESCRIPTOR=/\bObject\.getOwnPropertyDescriptor\(\s*([A-Za-z_$][\w$]*)\.constructor\.prototype\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;

export function transformPinnedReactDomInputTracker(code,id,{target,reactDomVersion}={}){
  if(target!=='ui/tool-shell.js'||id.startsWith('\\0')||id.includes('?')||
    !CLIENT_MODULE.test(id.replaceAll('\\','/')))
    return null;
  if(reactDomVersion!==PINNED_REACT_DOM_VERSION)
    throw new Error('ReactDOM input tracker changed version; re-audit constructor safety');
  const matches=[...code.matchAll(TRACKER_DESCRIPTOR)];
  if(matches.length!==1)
    throw new Error('ReactDOM 19.2.0 input tracker descriptor drift; expected one reviewed constructor use');
  const match=matches[0],object=match[1],field=match[2];
  const nearby=code.slice(Math.max(0,match.index-600),match.index+match[0].length+1100);
  const hasOwnProperty=new RegExp('\\b'+object+'\\.hasOwnProperty\\(\\s*'+field+'\\s*\\)');
  if(!/["']checked["']\s*:\s*["']value["']/.test(nearby)||!hasOwnProperty.test(nearby))
    throw new Error('ReactDOM input tracker source shape drift; review before bundling');
  const replacement='Object.getOwnPropertyDescriptor(Object.getPrototypeOf('+object+'), '+field+')';
  return code.slice(0,match.index)+replacement+code.slice(match.index+match[0].length);
}
