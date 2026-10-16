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
  const nearby=code.slice(Math.max(0,match.index-600),match.index+match[0].length+3500);
  const hasOwnProperty=new RegExp('\\b'+object+'\\.hasOwnProperty\\(\\s*'+field+'\\s*\\)');
  const prodSource=id.endsWith('react-dom-client.production.js')&&
    /["']checked["']\s*:\s*["']value["']/.test(nearby);
  // ReactDOM development splits the checked/value choice into trackValueOnNode's
  // caller; validate the descriptor read together with own-property and
  // defineProperty checks rather than weakening to a generic constructor edit.
  const defineProperty=new RegExp('Object\\.defineProperty\\(\\s*'+object+'\\s*,\\s*'+field+'\\s*,');
  const devSource=id.endsWith('react-dom-client.development.js')&&
    defineProperty.test(nearby);
  if(!hasOwnProperty.test(nearby)||!(prodSource||devSource))
    throw new Error('ReactDOM input tracker source shape drift; review before bundling');
  const replacement='Object.getOwnPropertyDescriptor(Object.getPrototypeOf('+object+'), '+field+')';
  return code.slice(0,match.index)+replacement+code.slice(match.index+match[0].length);
}


// Continuous-event hydration replay in pinned ReactDOM 19.2.0 must not run an
// arbitrary nativeEvent.constructor. Use only literal DOM Event constructors.
const REPLAY_CONSTRUCTOR=/\bnew\s+([A-Za-z_$][\w$]*)\.constructor\s*\(\s*\1\.type\s*,\s*\1\s*\)/g;
export function transformPinnedReactDomReplayClone(code,id,{target,reactDomVersion}={}){
  if(target!=='ui/tool-shell.js'||id.startsWith('\0')||id.includes('?')||
    !CLIENT_MODULE.test(id.replaceAll('\\','/')))return null;
  if(reactDomVersion!==PINNED_REACT_DOM_VERSION)
    throw new Error('ReactDOM replay changed version; re-audit constructor safety');
  const matches=[...code.matchAll(REPLAY_CONSTRUCTOR)];
  if(matches.length!==1)
    throw new Error('ReactDOM replay constructor drift; expected one reviewed native event clone');
  const match=matches[0],event=match[1];
  const nearby=code.slice(Math.max(0,match.index-1400),match.index+match[0].length+950);
  if(!/\.nativeEvent\b/.test(nearby)||!/\.dispatchEvent\s*\(/.test(nearby))
    throw new Error('ReactDOM event replay callsite drift; expected nativeEvent and dispatchEvent');
  const clone="((event)=>{if(typeof PointerEvent==='function'&&event instanceof PointerEvent)return new PointerEvent(event.type,event);if(typeof DragEvent==='function'&&event instanceof DragEvent)return new DragEvent(event.type,event);if(typeof FocusEvent==='function'&&event instanceof FocusEvent)return new FocusEvent(event.type,event);if(typeof MouseEvent==='function'&&event instanceof MouseEvent)return new MouseEvent(event.type,event);return new Event(event.type,event)})("+event+")";
  return code.slice(0,match.index)+clone+code.slice(match.index+match[0].length);
}
